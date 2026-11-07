// End-to-end self-check against the JSON API. Runs on a throwaway database.
// Usage: npm run check
const os = require('os');
const path = require('path');
const fs = require('fs');
const { authenticator } = require('otplib');

const stamp = Date.now();
process.env.SIA_DB = process.env.SIA_DB || path.join(os.tmpdir(), 'foundit-check-' + stamp + '.db');
process.env.SIA_UPLOADS = process.env.SIA_UPLOADS || path.join(os.tmpdir(), 'foundit-check-uploads-' + stamp);
process.env.NODE_ENV = 'development';

const app = require('./server.js');
const { db } = require('./db');

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) passed += 1;
  else failures.push(name + (detail ? ' — ' + detail : ''));
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// One cookie jar per simulated browser, so admin and student sessions stay separate.
function agent(base) {
  const jar = new Map();
  return async function call(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => k + '=' + v).join('; ');
    const res = await fetch(base + url, { ...options, headers });
    for (const raw of res.headers.getSetCookie()) {
      const pair = raw.split(';')[0];
      const eq = pair.indexOf('=');
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    return { status: res.status, data };
  };
}

const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function latestCode(email, purpose) {
  return db.prepare(`
    SELECT c.code FROM codes c JOIN users u ON u.id = c.user_id
    WHERE u.email = ? AND c.purpose = ? ORDER BY c.id DESC LIMIT 1
  `).get(email, purpose);
}

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const guest = agent(base);
  const student = agent(base);
  const admin = agent(base);
  const owner = agent(base);

  try {
    let r = await guest('/api/me');
    check('anonymous /me returns no user', r.status === 200 && r.data.user === null && r.data.config.categories.length > 0, JSON.stringify(r.data));

    r = await guest('/api/posts');
    check('post feed loads', r.status === 200 && Array.isArray(r.data.posts) && r.data.posts.length > 0, 'posts ' + (r.data && r.data.posts && r.data.posts.length));

    r = await guest('/api/posts?q=wallet');
    check('search filters posts', r.status === 200 && r.data.posts.length > 0 && r.data.posts.every((p) => p.item_name.includes('Wallet')), 'matches ' + (r.data && r.data.posts.length));

    r = await guest('/api/signup', json({ email: 'paolo.ramos26@gmail.com', student_id: '2026-00401', password: 'Password123', confirm_password: 'Password123' }));
    check('rejects non-BU email', r.status === 400, 'status ' + r.status);

    r = await guest('/api/signup', json({ email: 'paolo.ramos26@bicol-u.edu.ph', student_id: '2023-00233', password: 'Password123', confirm_password: 'Password123' }));
    check('rejects mismatched student id', r.status === 400, 'status ' + r.status);

    r = await guest('/api/signup', json({ email: 'nobody.here99@bicol-u.edu.ph', student_id: '2026-00401', password: 'Password123', confirm_password: 'Password123' }));
    check('rejects email not in roster', r.status === 400, 'status ' + r.status);

    r = await student('/api/signup', json({ email: 'paolo.ramos26@bicol-u.edu.ph', student_id: '2026-00401', password: 'Password123', confirm_password: 'Password123' }));
    check('signup accepts roster match', r.status === 200 && r.data.ok === true, 'status ' + r.status);

    r = await student('/api/verify', json({ email: 'paolo.ramos26@bicol-u.edu.ph', code: '000000' }));
    check('wrong verification code rejected', r.status === 400, 'status ' + r.status);

    const verifyCode = latestCode('paolo.ramos26@bicol-u.edu.ph', 'verify');
    check('verification code generated', Boolean(verifyCode && /^\d{6}$/.test(verifyCode.code)), 'code ' + (verifyCode && verifyCode.code));

    r = await student('/api/verify', json({ email: 'paolo.ramos26@bicol-u.edu.ph', code: verifyCode ? verifyCode.code : '' }));
    check('correct code verifies and signs in', r.status === 200 && r.data.user.full_name === 'Paolo Miguel Ramos', 'status ' + r.status + ' user ' + (r.data.user && r.data.user.full_name));

    r = await student('/api/me');
    check('session identifies the student', r.status === 200 && r.data.user && r.data.user.student_id === '2026-00401', JSON.stringify(r.data.user));

    const photo = new FormData();
    photo.append('type', 'found');
    photo.append('item_name', 'Blue Hydro Flask');
    photo.append('category', 'Other');
    photo.append('description', 'Blue metal flask with a dent near the base and a sticker on the lid.');
    photo.append('location', 'IT Building');
    photo.append('occurred_at', '2026-10-27T08:30');
    photo.append('photo', new Blob([PNG_1PX], { type: 'image/png' }), 'flask.png');

    r = await student('/api/posts', { method: 'POST', body: photo });
    check('photo post created', r.status === 201 && Number(r.data.id) > 0, 'status ' + r.status);
    const postId = r.data.id;

    r = await guest('/api/posts/' + postId);
    check('post detail renders', r.status === 200 && r.data.post.item_name === 'Blue Hydro Flask', 'status ' + r.status);
    check('uploaded image is attached', /^[0-9a-f-]+\.png$/.test(r.data.post.image || ''), 'image ' + (r.data.post && r.data.post.image));

    r = await student('/api/posts', json({ type: 'lost', item_name: '', category: 'Other', description: 'x', location: 'IT Building', occurred_at: '2026-10-27T08:30' }));
    check('post without a name rejected', r.status === 400, 'status ' + r.status);

    r = await student('/api/posts/' + postId + '/contact', { method: 'POST' });
    check('cannot contact your own post', r.status === 400, 'status ' + r.status);

    r = await student('/api/admin');
    check('student cannot open admin', r.status === 403, 'status ' + r.status);

    await student('/api/logout', { method: 'POST' });

    r = await student('/api/login', json({ email: 'maria.santos24@bicol-u.edu.ph', password: 'Password123' }));
    check('student login works', r.status === 200 && r.data.user.full_name === 'Maria Clara Santos', 'status ' + r.status);

    r = await student('/api/posts/' + postId + '/contact', { method: 'POST' });
    check('contact opens a conversation', r.status === 200 && Number(r.data.conversationId) > 0, 'status ' + r.status);
    const conversationId = r.data.conversationId;

    r = await student('/api/conversations/' + conversationId + '/messages', json({ body: 'Hi, that flask is mine. It has a sticker of a cat on the lid.' }));
    check('message sends', r.status === 201, 'status ' + r.status);

    r = await student('/api/conversations/' + conversationId + '/feed?after=0');
    check('polling feed returns the message', r.status === 200 && r.data.messages.length === 1 && r.data.messages[0].body.includes('sticker of a cat'), 'messages ' + (r.data && r.data.messages && r.data.messages.length));

    const messageId = db.prepare('SELECT id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1').get(conversationId).id;

    r = await owner('/api/login', json({ email: 'paolo.ramos26@bicol-u.edu.ph', password: 'Password123' }));
    check('post owner can log in', r.status === 200, 'status ' + r.status);

    r = await owner('/api/conversations/' + conversationId + '/messages/' + messageId, { method: 'DELETE' });
    check('only the sender can delete a message', r.status === 403, 'status ' + r.status);
    await owner('/api/logout', { method: 'POST' });

    r = await student('/api/conversations/' + conversationId + '/messages/' + messageId, { method: 'DELETE' });
    check('sender deletes a message', r.status === 200 && r.data.ok === true, 'status ' + r.status);

    const tombstone = db.prepare('SELECT body, deleted_at FROM messages WHERE id = ?').get(messageId);
    check('delete is a tombstone, not a row delete', Boolean(tombstone && tombstone.deleted_at && tombstone.body.includes('sticker')), JSON.stringify(tombstone));

    r = await student('/api/conversations/' + conversationId + '/feed?after=0');
    check('feed reports deleted ids and hides the text', r.status === 200 && r.data.deleted.includes(messageId) && r.data.messages[0].body === '', 'deleted ' + JSON.stringify(r.data && r.data.deleted));

    r = await student('/api/conversations');
    const convRow = r.data.conversations.find((c) => c.id === conversationId);
    check('conversation preview shows the delete', Boolean(convRow && convRow.last_body === 'Message deleted'), convRow && convRow.last_body);

    await student('/api/logout', { method: 'POST' });

    const adminPassword = process.env.ADMIN_PASSWORD || 'Password123';
    r = await admin('/api/login', json({ email: 'admin@bicol-u.edu.ph', password: adminPassword }));
    check('admin password alone is not enough', r.status === 200 && r.data.needs2fa === true && r.data.needsTotpSetup === true, JSON.stringify(r.data));

    r = await admin('/api/me');
    check('no admin session before the authenticator code', r.data.user === null, JSON.stringify(r.data.user));

    r = await admin('/api/2fa/verify', json({ code: '123456' }));
    check('2FA verify before enrollment is rejected', r.status === 401, 'status ' + r.status);

    r = await admin('/api/2fa/setup', { method: 'POST' });
    check('2FA setup returns a QR image and secret', r.status === 200 && String(r.data.qr || '').startsWith('data:image/png;base64,') && /^[A-Z2-7]{16,}$/.test(r.data.secret || ''), 'status ' + r.status);
    const totpSecret = r.data.secret;
    const firstToken = authenticator.generate(totpSecret);

    r = await admin('/api/2fa/enable', json({ code: '000000' }));
    check('wrong authenticator code rejected', r.status === 401, 'status ' + r.status);

    r = await admin('/api/2fa/enable', json({ code: firstToken }));
    check('correct code enables 2FA and logs in', r.status === 200 && r.data.user.role === 'admin', 'status ' + r.status);

    await admin('/api/logout', { method: 'POST' });

    r = await admin('/api/login', json({ email: 'admin@bicol-u.edu.ph', password: adminPassword }));
    check('enrolled admin login asks for the code', r.data.needs2fa === true && r.data.needsTotpSetup === false, JSON.stringify(r.data));

    r = await admin('/api/2fa/verify', json({ code: firstToken }));
    check('replayed authenticator code rejected', r.status === 401, 'status ' + r.status);

    const nextToken = authenticator.clone({ epoch: Date.now() + 30000 }).generate(totpSecret);
    r = await admin('/api/2fa/verify', json({ code: nextToken }));
    check('fresh authenticator code logs in', r.status === 200 && r.data.user.role === 'admin', 'status ' + r.status);

    r = await admin('/api/admin/events');
    check('admin activity log records sign-ins', r.status === 200 && r.data.events.some((e) => e.action === 'login'), 'status ' + r.status);
    check('admin activity log records sign-outs', r.data.events.some((e) => e.action === 'logout'), 'no logout rows');

    r = await guest('/api/admin/events');
    check('activity log is admin-only', r.status === 401, 'status ' + r.status);

    r = await admin('/api/admin');
    check('admin dashboard loads', r.status === 200 && r.data.stats && r.data.stats.posts > 0, 'status ' + r.status);
    check('admin sees the new post notification', r.data.newPosts.some((p) => p.id === postId), 'post missing from new reports');

    r = await admin('/api/admin/posts/' + postId + '/resolve', { method: 'POST' });
    check('admin resolves a post', r.status === 200 && r.data.ok === true, 'status ' + r.status);
    check('post marked resolved', db.prepare('SELECT status FROM posts WHERE id = ?').get(postId).status === 'resolved', 'not resolved');

    r = await admin('/api/conversations/' + conversationId);
    check('admin cannot read student-to-student conversations', r.status === 404, 'status ' + r.status);

    await admin('/api/logout', { method: 'POST' });

    r = await guest('/api/nope');
    check('unknown API route 404s as JSON', r.status === 404 && r.data.error === 'Route not found.', 'status ' + r.status);

    r = await guest('/api/forgot', json({ email: 'paolo.ramos26@bicol-u.edu.ph' }));
    check('forgot password issues a reset code', r.status === 200 && r.data.ok === true, 'status ' + r.status);

    const resetCode = latestCode('paolo.ramos26@bicol-u.edu.ph', 'reset');
    check('reset code generated', Boolean(resetCode && /^\d{6}$/.test(resetCode.code)), 'code ' + (resetCode && resetCode.code));

    r = await guest('/api/reset', json({ email: 'paolo.ramos26@bicol-u.edu.ph', code: resetCode ? resetCode.code : '', password: 'NewPassword456', confirm_password: 'NewPassword456' }));
    check('reset accepted', r.status === 200 && r.data.ok === true, 'status ' + r.status);

    r = await guest('/api/login', json({ email: 'paolo.ramos26@bicol-u.edu.ph', password: 'NewPassword456' }));
    check('login works after reset', r.status === 200, 'status ' + r.status);

    r = await guest('/api/login', json({ email: 'paolo.ramos26@bicol-u.edu.ph', password: 'Password123' }));
    check('old password no longer works', r.status === 401, 'status ' + r.status);

    r = await guest('/');
    check('static frontend is served', r.status === 200, 'status ' + r.status);
  } finally {
    server.close();
    try {
      fs.rmSync(process.env.SIA_UPLOADS, { recursive: true, force: true });
      for (const suffix of ['', '-wal', '-shm']) fs.rmSync(process.env.SIA_DB + suffix, { force: true });
    } catch (e) {
      // Windows can still hold the SQLite file; the temp folder is disposable either way.
    }
  }

  console.log('\n' + passed + ' checks passed');
  if (failures.length) {
    console.log(failures.length + ' failed:');
    failures.forEach((f) => console.log('  x ' + f));
    process.exitCode = 1;
  } else {
    console.log('All good.');
  }
}

main().catch((err) => {
  console.error('check crashed:', err);
  process.exitCode = 1;
});
