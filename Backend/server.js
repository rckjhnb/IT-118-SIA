require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const { db } = require('./db');
const { IS_PROD, UPLOAD_DIR, requireAdmin } = require('./shared');
const auth = require('./auth');
const posts = require('./posts');
const chat = require('./chat');
const admin = require('./admin');

const app = express();
const PORT = Number(process.env.PORT || 3000);

let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (IS_PROD) throw new Error('SESSION_SECRET must be set when NODE_ENV=production.');
  secret = crypto.randomBytes(32).toString('hex'); // dev only: sessions reset on restart anyway
}

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '100kb' }));
// shortcut: in-memory session store; every restart logs everyone out. Swap in a persistent store before real use.
app.use(session({
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: IS_PROD ? 'auto' : false, maxAge: 1000 * 60 * 60 * 8 },
}));

// CSRF defence: SameSite=lax cookies plus a same-origin check on every write.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.get('host'); } catch (e) { /* malformed origin */ }
    if (!ok) return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'Frontend')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api', auth.router);
app.use('/api', posts.router);
app.use('/api', chat.router);
app.use('/api', admin.router);

// Dev outbox shows verification codes when no SMTP is configured. Never mounted in production.
if (!IS_PROD) {
  app.get('/api/dev/outbox', (req, res) => {
    res.json({ messages: db.prepare('SELECT * FROM mail_outbox ORDER BY id DESC LIMIT 50').all() });
  });
  app.post('/api/dev/outbox/clear', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM mail_outbox').run();
    res.json({ ok: true });
  });
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((req, res) => res.status(404).type('text').send('Not found'));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large. Max 5 MB.' : 'Upload failed: ' + err.message;
    return res.status(400).json({ error: msg });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad JSON.' });
  console.error(err);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

if (require.main === module) {
  if (IS_PROD && !process.env.SMTP_HOST) console.warn('[mail] SMTP_HOST is not set. Verification codes will not be delivered.');
  app.listen(PORT, () => {
    console.log('FoundIT running at http://localhost:' + PORT);
    if (!IS_PROD) console.log('Dev outbox (verification codes): http://localhost:' + PORT + '/#/outbox');
  });
}

module.exports = app;
