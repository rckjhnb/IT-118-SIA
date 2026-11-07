const express = require('express');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { db, hashPassword, checkPassword } = require('./db');
const { sendCode } = require('./mail');
const { IS_PROD, BU_EMAIL, CATEGORIES, LOCATIONS, rateLimit } = require('./shared');

const router = express.Router();
const limit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

authenticator.options = { window: 1 }; // accept the previous/next 30-second step for clock drift
const APP_NAME = 'FoundIT';

function logEvent(user, action) {
  db.prepare('INSERT INTO auth_events (user_id, email, role, action, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, user.email, user.role, action, new Date().toISOString());
}

// The admin password only proves half the login; this is the half-finished state.
function pendingAdmin(req) {
  if (!req.session.pendingAdminId) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.pendingAdminId);
  return user && user.role === 'admin' ? user : null;
}

function consumeTotp(user, token) {
  if (!/^\d{6}$/.test(token)) return { ok: false, error: 'Enter the 6-digit code from your authenticator app.' };
  // A 6-digit code stays valid for up to 90s (window 1); reject replaying the same one.
  if (String(user.totp_last_token || '') === token) return { ok: false, error: 'That code was already used. Wait for the next one.' };
  if (!user.totp_secret || !authenticator.verify({ token, secret: user.totp_secret })) {
    return { ok: false, error: 'That code is not correct.' };
  }
  db.prepare('UPDATE users SET totp_last_token = ? WHERE id = ?').run(token, user.id);
  return { ok: true };
}

function newCode(userId, purpose) {
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare('UPDATE codes SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL')
    .run(new Date().toISOString(), userId, purpose);
  db.prepare('INSERT INTO codes (user_id, purpose, code, expires_at) VALUES (?, ?, ?, ?)')
    .run(userId, purpose, code, new Date(Date.now() + 15 * 60 * 1000).toISOString());
  return code;
}

function readCode(userId, purpose, code) {
  const row = db.prepare(`
    SELECT * FROM codes
    WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?
    ORDER BY id DESC LIMIT 1
  `).get(userId, purpose, new Date().toISOString());
  if (!row) return { ok: false, reason: 'That code is expired or already used. Request a new one.' };
  const a = Buffer.from(row.code);
  const b = Buffer.from(code);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'That code is not correct.' };
  db.prepare('UPDATE codes SET used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  return { ok: true };
}

function profileFor(userId) {
  return db.prepare(`
    SELECT u.id, u.email, u.role, u.verified_at, s.student_id, s.full_name, s.course, s.year_level, s.block
    FROM users u LEFT JOIN students s ON s.student_id = u.student_id
    WHERE u.id = ?
  `).get(userId);
}

const clean = (v) => String(v || '').trim().toLowerCase();

function startSession(req, res, user, extra = {}) {
  logEvent(user, 'login');
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start your session.' });
    req.session.user = { id: user.id, email: user.email, role: user.role };
    res.json({ ok: true, user: profileFor(user.id), ...extra });
  });
}

router.get('/me', (req, res) => {
  let user = null;
  let unread = 0;
  if (req.session.user) {
    user = profileFor(req.session.user.id);
    if (!user) req.session.destroy(() => {});
    else {
      unread = db.prepare(`
        SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE m.read_at IS NULL AND m.sender_id != ? AND (c.owner_id = ? OR c.other_id = ?)
      `).get(user.id, user.id, user.id).n;
    }
  }
  res.json({ user, unread, config: { categories: CATEGORIES, locations: LOCATIONS, demo: !IS_PROD } });
});

router.post('/signup', limit, async (req, res) => {
  const email = clean(req.body.email);
  const studentId = String(req.body.student_id || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm_password || '');
  const fail = (error) => res.status(400).json({ error });

  if (!BU_EMAIL.test(email)) return fail('Use your BU email in the format firstname.lastnameYY@bicol-u.edu.ph.');
  if (!studentId) return fail('Student ID is required.');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (password !== confirm) return fail('Passwords do not match.');

  const student = db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student) return fail('That BU email is not in the student roster.');
  if (student.student_id !== studentId) return fail('That Student ID does not match this BU email.');

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing && existing.verified_at) return fail('This account already exists. Log in instead.');

  let userId;
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), existing.id);
    userId = existing.id;
  } else {
    userId = db.prepare("INSERT INTO users (email, student_id, password_hash, role, verified_at, created_at) VALUES (?, ?, ?, 'student', NULL, ?)")
      .run(email, student.student_id, hashPassword(password), new Date().toISOString()).lastInsertRowid;
  }
  await sendCode(email, newCode(userId, 'verify'), 'verify');
  res.json({ ok: true, email });
});

router.post('/verify', limit, (req, res) => {
  const email = clean(req.body.email);
  const code = String(req.body.code || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(400).json({ error: 'No pending account for that email. Sign up first.' });
  if (user.verified_at) return res.status(400).json({ error: 'That account is already verified. Log in.' });

  const result = readCode(user.id, 'verify', code);
  if (!result.ok) return res.status(400).json({ error: result.reason });

  db.prepare('UPDATE users SET verified_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  startSession(req, res, user);
});

router.post('/verify/resend', limit, async (req, res) => {
  const email = clean(req.body.email);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && !user.verified_at) await sendCode(email, newCode(user.id, 'verify'), 'verify');
  res.json({ ok: true });
});

router.post('/login', limit, (req, res) => {
  const email = clean(req.body.email);
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !checkPassword(password, user.password_hash)) return res.status(401).json({ error: 'Wrong email or password.' });
  if (!user.verified_at) return res.status(403).json({ error: 'Verify your BU email first. We can send a new code.', needsVerify: true, email });

  if (user.role === 'admin') {
    // Password is only step one. No session until the authenticator code checks out.
    return req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Could not start your session.' });
      req.session.pendingAdminId = user.id;
      res.json({ needs2fa: true, needsTotpSetup: !user.totp_enabled });
    });
  }
  startSession(req, res, user);
});

// First admin login: create the TOTP secret and show the QR for Google Authenticator.
router.post('/2fa/setup', limit, async (req, res) => {
  const user = pendingAdmin(req);
  if (!user) return res.status(401).json({ error: 'Log in with your admin password first.' });
  if (user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is already set up.' });

  const secret = authenticator.generateSecret();
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);
  const otpauth = authenticator.keyuri(user.email, APP_NAME, secret);
  const qr = await QRCode.toDataURL(otpauth);
  res.json({ secret, otpauth, qr });
});

router.post('/2fa/enable', limit, (req, res) => {
  const user = pendingAdmin(req);
  if (!user) return res.status(401).json({ error: 'Log in with your admin password first.' });
  if (!user.totp_secret) return res.status(400).json({ error: 'Start the setup first.' });

  const result = consumeTotp(user, String(req.body.code || '').trim());
  if (!result.ok) return res.status(401).json({ error: result.error });

  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
  startSession(req, res, user);
});

router.post('/2fa/verify', limit, (req, res) => {
  const user = pendingAdmin(req);
  if (!user || !user.totp_enabled) return res.status(401).json({ error: 'Log in with your admin password first.' });

  const result = consumeTotp(user, String(req.body.code || '').trim());
  if (!result.ok) return res.status(401).json({ error: result.error });
  startSession(req, res, user);
});

router.post('/logout', (req, res) => {
  const user = req.session.user && db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (user) logEvent(user, 'logout');
  req.session.destroy(() => res.json({ ok: true }));
});

router.post('/forgot', limit, async (req, res) => {
  const email = clean(req.body.email);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && user.verified_at) await sendCode(email, newCode(user.id, 'reset'), 'reset');
  res.json({ ok: true, email }); // same answer either way so emails can't be probed
});

router.post('/reset', limit, (req, res) => {
  const email = clean(req.body.email);
  const code = String(req.body.code || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm_password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const fail = (error) => res.status(400).json({ error });

  if (!user) return fail('That code is not correct.');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (password !== confirm) return fail('Passwords do not match.');

  const result = readCode(user.id, 'reset', code);
  if (!result.ok) return fail(result.reason);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  res.json({ ok: true });
});

module.exports = { router, profileFor };
