const express = require('express');
const crypto = require('crypto');
const { db, hashPassword, checkPassword } = require('./db');
const { sendCode } = require('./mail');
const { BU_EMAIL, flash, readFlash } = require('./shared');

const router = express.Router();

function newCode(userId, purpose) {
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare("UPDATE codes SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL")
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
  const same = Buffer.from(row.code).length === Buffer.from(code).length
    && crypto.timingSafeEqual(Buffer.from(row.code), Buffer.from(code));
  if (!same) return { ok: false, reason: 'That code is not correct.' };
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

router.get('/signup', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('signup', { title: 'Sign up', error: null, values: {}, flash: readFlash(req) });
});

router.post('/signup', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const studentId = String(req.body.student_id || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm_password || '');
  const values = { email, student_id: studentId };

  const fail = (error) => res.status(400).render('signup', { title: 'Sign up', error, values, flash: null });

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

  const code = newCode(userId, 'verify');
  await sendCode(email, code, 'verify');
  flash(req, 'ok', 'We sent a 6-digit code to ' + email + '.');
  res.redirect('/verify?email=' + encodeURIComponent(email));
});

router.get('/verify', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.redirect('/signup');
  res.render('verify', { title: 'Verify email', email, error: null, flash: readFlash(req) });
});

router.post('/verify', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.redirect('/signup');

  if (user.verified_at) {
    flash(req, 'ok', 'That account is already verified. Log in.');
    return res.redirect('/login');
  }

  const result = readCode(user.id, 'verify', code);
  if (!result.ok) return res.status(400).render('verify', { title: 'Verify email', email, error: result.reason, flash: null });

  db.prepare('UPDATE users SET verified_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: 'Error', message: 'Could not start your session.' });
    const profile = profileFor(user.id);
    req.session.user = { id: profile.id, email: profile.email, role: profile.role };
    flash(req, 'ok', 'Email verified. Welcome, ' + profile.full_name + '!');
    res.redirect('/');
  });
});

router.post('/verify/resend', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && !user.verified_at) {
    const code = newCode(user.id, 'verify');
    await sendCode(email, code, 'verify');
  }
  flash(req, 'ok', 'If that account is waiting for verification, a new code is on the way.');
  res.redirect('/verify?email=' + encodeURIComponent(email));
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Log in', error: null, values: {}, next: String(req.query.next || ''), flash: readFlash(req) });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const next = String(req.body.next || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const fail = () => res.status(401).render('login', { title: 'Log in', error: 'Wrong email or password.', values: { email }, next, flash: null });

  if (!user || !checkPassword(password, user.password_hash)) return fail();

  if (!user.verified_at) {
    flash(req, 'err', 'Verify your BU email first. We can send a new code.');
    return res.redirect('/verify?email=' + encodeURIComponent(email));
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: 'Error', message: 'Could not start your session.' });
    req.session.user = { id: user.id, email: user.email, role: user.role };
    const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    res.redirect(target);
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.get('/forgot', (req, res) => {
  res.render('forgot', { title: 'Forgot password', error: null, sent: false, values: {}, flash: readFlash(req) });
});

router.post('/forgot', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && user.verified_at) {
    const code = newCode(user.id, 'reset');
    await sendCode(email, code, 'reset');
    return res.redirect('/reset?email=' + encodeURIComponent(email));
  }
  res.status(200).render('forgot', { title: 'Forgot password', error: null, sent: true, values: { email }, flash: null });
});

router.get('/reset', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  res.render('reset', { title: 'Reset password', email, error: null, flash: readFlash(req) });
});

router.post('/reset', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm_password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const fail = (error) => res.status(400).render('reset', { title: 'Reset password', email, error, flash: null });

  if (!user) return fail('No account uses that email.');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (password !== confirm) return fail('Passwords do not match.');

  const result = readCode(user.id, 'reset', code);
  if (!result.ok) return fail(result.reason);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  flash(req, 'ok', 'Password updated. You can log in now.');
  res.redirect('/login');
});

module.exports = { router, profileFor };
