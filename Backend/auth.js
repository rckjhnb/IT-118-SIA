const express = require('express');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { getDb, nextId, hashPassword, checkPassword } = require('./db');
const { IS_PROD, BU_EMAIL, CATEGORIES, LOCATIONS, rateLimit } = require('./shared');

const router = express.Router();
const limit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

authenticator.options = { window: 1 }; // accept the previous/next 30-second step for clock drift
const APP_NAME = 'FoundIT';

async function logEvent(user, action) {
  await getDb().collection('auth_events').insertOne({
    _id: await nextId('auth_events'),
    user_id: user.id,
    email: user.email,
    role: user.role,
    action,
    created_at: new Date().toISOString(),
  });
}

// The admin password only proves half the login; this is the half-finished state.
async function pendingAdmin(req) {
  if (!req.session.pendingAdminId) return null;
  const user = await getDb().collection('users').findOne({ _id: req.session.pendingAdminId });
  return user && user.role === 'admin' ? user : null;
}

async function consumeTotp(user, token) {
  if (!/^\d{6}$/.test(token)) return { ok: false, error: 'Enter the 6-digit code from your authenticator app.' };
  // A 6-digit code stays valid for up to 90s (window 1); reject replaying the same one.
  if (String(user.totp_last_token || '') === token) return { ok: false, error: 'That code was already used. Wait for the next one.' };
  if (!user.totp_secret || !authenticator.verify({ token, secret: user.totp_secret })) {
    return { ok: false, error: 'That code is not correct.' };
  }
  await getDb().collection('users').updateOne({ _id: user._id }, { $set: { totp_last_token: token } });
  return { ok: true };
}

async function profileFor(userId) {
  const db = getDb();
  const user = await db.collection('users').findOne({ _id: userId });
  if (!user) return null;
  // Only attach roster details when the account's own email matches that roster row.
  const student = user.student_id
    ? await db.collection('students').findOne({ _id: user.student_id, email: user.email })
    : null;
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    verified_at: user.verified_at,
    student_id: student ? student._id : user.student_id,
    full_name: student ? student.full_name : null,
    course: student ? student.course : null,
    year_level: student ? student.year_level : null,
    block: student ? student.block : null,
  };
}

async function unreadCount(userId) {
  const db = getDb();
  const conversations = await db.collection('conversations')
    .find({ $or: [{ owner_id: userId }, { other_id: userId }] }, { projection: { _id: 1 } })
    .toArray();
  if (!conversations.length) return 0;
  return db.collection('messages').countDocuments({
    conversation_id: { $in: conversations.map((c) => c._id) },
    sender_id: { $ne: userId },
    read_at: null,
  });
}

const clean = (v) => String(v || '').trim().toLowerCase();

async function startSession(req, res, user, extra = {}) {
  const profile = await profileFor(user._id);
  await logEvent({ id: user._id, email: user.email, role: user.role }, 'login');
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start your session.' });
    req.session.user = { id: user._id, email: user.email, role: user.role };
    res.json({ ok: true, user: profile, ...extra });
  });
}

router.get('/me', async (req, res) => {
  let user = null;
  let unread = 0;
  if (req.session.user) {
    user = await profileFor(req.session.user.id);
    if (!user) req.session.destroy(() => {});
    else unread = await unreadCount(user.id);
  }
  res.json({ user, unread, config: { categories: CATEGORIES, locations: LOCATIONS, demo: !IS_PROD } });
});

router.post('/signup', limit, async (req, res) => {
  const db = getDb();
  const email = clean(req.body.email);
  const studentId = String(req.body.student_id || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm_password || '');
  const fail = (error) => res.status(400).json({ error });

  if (!BU_EMAIL.test(email)) return fail('Use your BU email in the format firstname.lastnameYY@bicol-u.edu.ph.');
  if (!studentId) return fail('Student ID is required.');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (password !== confirm) return fail('Passwords do not match.');

  const existing = await db.collection('users').findOne({ email });
  if (existing && existing.verified_at) return fail('This account already exists. Log in instead.');

  const now = new Date().toISOString();
  let user;
  if (existing) {
    await db.collection('users').updateOne({ _id: existing._id }, { $set: { password_hash: hashPassword(password), verified_at: now } });
    user = { ...existing, verified_at: now };
  } else {
    user = {
      _id: await nextId('users'), email, student_id: studentId, password_hash: hashPassword(password),
      role: 'student', verified_at: now, created_at: now,
      totp_secret: null, totp_enabled: false, totp_last_token: null,
    };
    await db.collection('users').insertOne(user);
  }
  await startSession(req, res, user);
});

router.post('/login', limit, async (req, res) => {
  const email = clean(req.body.email);
  const password = String(req.body.password || '');
  const user = await getDb().collection('users').findOne({ email });

  if (!user || !checkPassword(password, user.password_hash)) return res.status(401).json({ error: 'Wrong email or password.' });

  if (user.role === 'admin') {
    // Password is only step one. No session until the authenticator code checks out.
    return req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Could not start your session.' });
      req.session.pendingAdminId = user._id;
      res.json({ needs2fa: true, needsTotpSetup: !user.totp_enabled });
    });
  }
  await startSession(req, res, user);
});

// First admin login: create the TOTP secret and show the QR for Google Authenticator.
router.post('/2fa/setup', limit, async (req, res) => {
  const user = await pendingAdmin(req);
  if (!user) return res.status(401).json({ error: 'Log in with your admin password first.' });
  if (user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is already set up.' });

  const secret = authenticator.generateSecret();
  await getDb().collection('users').updateOne({ _id: user._id }, { $set: { totp_secret: secret } });
  const otpauth = authenticator.keyuri(user.email, APP_NAME, secret);
  const qr = await QRCode.toDataURL(otpauth);
  res.json({ secret, otpauth, qr });
});

router.post('/2fa/enable', limit, async (req, res) => {
  const user = await pendingAdmin(req);
  if (!user) return res.status(401).json({ error: 'Log in with your admin password first.' });
  if (!user.totp_secret) return res.status(400).json({ error: 'Start the setup first.' });

  const result = await consumeTotp(user, String(req.body.code || '').trim());
  if (!result.ok) return res.status(401).json({ error: result.error });

  await getDb().collection('users').updateOne({ _id: user._id }, { $set: { totp_enabled: true } });
  await startSession(req, res, user);
});

router.post('/2fa/verify', limit, async (req, res) => {
  const user = await pendingAdmin(req);
  if (!user || !user.totp_enabled) return res.status(401).json({ error: 'Log in with your admin password first.' });

  const result = await consumeTotp(user, String(req.body.code || '').trim());
  if (!result.ok) return res.status(401).json({ error: result.error });
  await startSession(req, res, user);
});

router.post('/logout', async (req, res) => {
  const user = req.session.user && await getDb().collection('users').findOne({ _id: req.session.user.id });
  if (user) await logEvent({ id: user._id, email: user.email, role: user.role }, 'logout');
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = { router, profileFor, unreadCount };
