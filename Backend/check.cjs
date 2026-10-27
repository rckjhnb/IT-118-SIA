// End-to-end self-check. Runs the app on a throwaway database and walks the real flows.
// Usage: npm run check
process.env.SIA_DB = process.env.SIA_DB || require('path').join(require('os').tmpdir(), 'sia-check-' + Date.now() + '.db');
process.env.SIA_UPLOADS = process.env.SIA_UPLOADS || require('path').join(require('os').tmpdir(), 'sia-check-uploads-' + Date.now());

const path = require('path');
const app = require('./server.js');
const { db } = require('./db');

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
  } else {
    failures.push(name + (detail ? ' — ' + detail : ''));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cookies = new Map();

function storeCookies(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const raw of list) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

async function request(base, url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => k + '=' + v).join('; ');
  const res = await fetch(base + url, { ...options, headers, redirect: 'manual' });
  storeCookies(res);
  return res;
}

function form(data) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  };
}

async function text(res) {
  return res.text();
}

function latestCode(email, purpose) {
  return db.prepare(`
    SELECT c.code FROM codes c JOIN users u ON u.id = c.user_id
    WHERE u.email = ? AND c.purpose = ? ORDER BY c.id DESC LIMIT 1
  `).get(email, purpose);
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const go = (url, options) => request(base, url, options);

  try {
    let res = await go('/');
    check('home renders', res.status === 200 && (await text(res)).includes('Campus Lost'), 'status ' + res.status);

    res = await go('/dev/outbox');
    check('dev outbox renders', res.status === 200, 'status ' + res.status);

    res = await go('/signup', form({
      email: 'paolo.ramos26@gmail.com', student_id: '2026-00401', password: 'Password123', confirm_password: 'Password123',
    }));
    check('rejects non-BU email', res.status === 400, 'status ' + res.status);

    res = await go('/signup', form({
      email: 'paolo.ramos26@bicol-u.edu.ph', student_id: '2023-00233', password: 'Password123', confirm_password: 'Password123',
    }));
    check('rejects mismatched student id', res.status === 400, 'status ' + res.status);

    res = await go('/signup', form({
      email: 'nobody.here99@bicol-u.edu.ph', student_id: '2026-00401', password: 'Password123', confirm_password: 'Password123',
    }));
    check('rejects email not in roster', res.status === 400, 'status ' + res.status);

    res = await go('/signup', form({
      email: 'paolo.ramos26@bicol-u.edu.ph', student_id: '2026-00401', password: 'Password123', confirm_password: 'Password123',
    }));
    const signupOk = res.status === 302 && (res.headers.get('location') || '').startsWith('/verify');
    check('signup accepts roster match', signupOk, 'status ' + res.status + ' location ' + res.headers.get('location'));

    const verifyCode = latestCode('paolo.ramos26@bicol-u.edu.ph', 'verify');
    check('verification code generated', Boolean(verifyCode && /^\d{6}$/.test(verifyCode.code)), 'code ' + (verifyCode && verifyCode.code));

    res = await go('/verify', form({ email: 'paolo.ramos26@bicol-u.edu.ph', code: '000000' }));
    check('wrong code rejected', res.status === 400, 'status ' + res.status);

    res = await go('/verify', form({ email: 'paolo.ramos26@bicol-u.edu.ph', code: verifyCode ? verifyCode.code : '' }));
    check('correct code verifies and logs in', res.status === 302, 'status ' + res.status);

    res = await go('/');
    const home = await text(res);
    check('session shows signed-in student', home.includes('Paolo Miguel Ramos'), 'name missing from nav');

    const photo = new FormData();
    photo.append('type', 'found');
    photo.append('item_name', 'Blue Hydro Flask');
    photo.append('category', 'Other');
    photo.append('description', 'Blue metal flask with a dent near the base and a sticker on the lid.');
    photo.append('location', 'IT Building');
    photo.append('occurred_at', '2026-10-27T08:30');
    photo.append('photo', new Blob([PNG_1PX], { type: 'image/png' }), 'flask.png');

    res = await go('/posts', { method: 'POST', body: photo });
    const postLocation = res.headers.get('location') || '';
    check('photo post created', res.status === 302 && /^\/posts\/\d+$/.test(postLocation), 'status ' + res.status + ' location ' + postLocation);
    const postId = Number(postLocation.split('/').pop());

    res = await go('/posts/' + postId);
    const detail = await text(res);
    check('post detail renders', res.status === 200 && detail.includes('Blue Hydro Flask'), 'status ' + res.status);
    check('uploaded image is attached', /\/uploads\/[0-9a-f-]+\.png/.test(detail), 'no upload url in page');

    res = await go('/posts', form({
      type: 'lost', item_name: '', category: 'Other', description: 'x', location: 'IT Building', occurred_at: '2026-10-27T08:30',
    }));
    check('post without a name rejected', res.status === 400, 'status ' + res.status);

    await go('/logout', { method: 'POST' });

    res = await go('/login', form({ email: 'maria.santos24@bicol-u.edu.ph', password: 'Password123' }));
    check('student login works', res.status === 302, 'status ' + res.status);

    res = await go('/posts/' + postId + '/contact', { method: 'POST' });
    const threadLocation = res.headers.get('location') || '';
    check('contact opens a conversation', res.status === 302 && /^\/messages\/\d+$/.test(threadLocation), 'status ' + res.status + ' location ' + threadLocation);
    const conversationId = Number(threadLocation.split('/').pop());

    res = await go('/messages/' + conversationId, form({ body: 'Hi, that flask is mine. It has a sticker of a cat on the lid.' }));
    check('message sends', res.status === 302, 'status ' + res.status);

    res = await go('/messages/' + conversationId + '/feed?after=0', { headers: { Accept: 'application/json' } });
    const feed = await res.json();
    check('feed returns the message', res.status === 200 && feed.messages.length === 1 && feed.messages[0].body.includes('sticker of a cat'), 'messages ' + feed.messages.length);

    res = await go('/admin');
    check('student cannot open admin', res.status === 403, 'status ' + res.status);

    await go('/logout', { method: 'POST' });

    res = await go('/login', form({ email: 'admin@bicol-u.edu.ph', password: 'Password123' }));
    check('admin login works', res.status === 302, 'status ' + res.status);

    res = await go('/admin');
    const admin = await text(res);
    check('admin dashboard renders', res.status === 200 && admin.includes('Admin dashboard'), 'status ' + res.status);
    check('admin sees the new post notification', admin.includes('Blue Hydro Flask'), 'post missing from new reports');

    res = await go('/admin/posts/' + postId + '/resolve', { method: 'POST' });
    check('admin resolves a post', res.status === 302, 'status ' + res.status);
    check('post marked resolved', db.prepare('SELECT status FROM posts WHERE id = ?').get(postId).status === 'resolved', 'not resolved');

    res = await go('/messages/' + conversationId);
    check('admin reads a conversation', res.status === 200, 'status ' + res.status);

    await go('/logout', { method: 'POST' });

    res = await go('/mcp');
    check('unknown page 404s', res.status === 404, 'status ' + res.status);

    res = await go('/forgot', form({ email: 'paolo.ramos26@bicol-u.edu.ph' }));
    check('forgot password issues a reset', res.status === 302 && (res.headers.get('location') || '').startsWith('/reset'), 'status ' + res.status);

    const resetCode = latestCode('paolo.ramos26@bicol-u.edu.ph', 'reset');
    check('reset code generated', Boolean(resetCode && /^\d{6}$/.test(resetCode.code)), 'code ' + (resetCode && resetCode.code));

    res = await go('/reset', form({
      email: 'paolo.ramos26@bicol-u.edu.ph', code: resetCode ? resetCode.code : '', password: 'NewPassword456', confirm_password: 'NewPassword456',
    }));
    check('reset accepted', res.status === 302, 'status ' + res.status);

    res = await go('/login', form({ email: 'paolo.ramos26@bicol-u.edu.ph', password: 'NewPassword456' }));
    check('login works after reset', res.status === 302, 'status ' + res.status);

    res = await go('/login', form({ email: 'paolo.ramos26@bicol-u.edu.ph', password: 'Password123' }));
    check('old password no longer works', res.status === 401, 'status ' + res.status);
  } finally {
    server.close();
  }

  console.log('\n' + passed + ' checks passed');
  if (failures.length) {
    console.log(failures.length + ' failed:');
    failures.forEach((f) => console.log('  ✗ ' + f));
    process.exitCode = 1;
  } else {
    console.log('All good.');
  }
}

main().catch((err) => {
  console.error('check crashed:', err.message);
  process.exitCode = 1;
});
