const path = require('path');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const { db } = require('./db');
const { UPLOAD_DIR, requireAuth, fmt, fmtShort, timeAgo, readFlash } = require('./shared');
const auth = require('./auth');
const posts = require('./posts');
const chat = require('./chat');
const admin = require('./admin');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
// shortcut: in-memory session store; every restart logs everyone out. Swap in a persistent store before real use.
app.use(session({
  secret: process.env.SESSION_SECRET || 'bu-lost-found-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));

app.use('/static', express.static(path.join(__dirname, '..', 'Frontedn')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.use((req, res, next) => {
  const me = req.session.user || null;
  let user = null;
  let unread = 0;
  if (me) {
    user = db.prepare(`
      SELECT u.id, u.email, u.role, u.verified_at, s.student_id, s.full_name, s.course, s.year_level, s.block
      FROM users u LEFT JOIN students s ON s.student_id = u.student_id WHERE u.id = ?
    `).get(me.id);
    if (!user) {
      req.session.destroy(() => {});
      return res.redirect('/login');
    }
    unread = db.prepare(`
      SELECT COUNT(*) n FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.read_at IS NULL AND m.sender_id != ?
        AND (? = 1 OR c.owner_id = ? OR c.other_id = ?)
    `).get(user.id, user.role === 'admin' ? 1 : 0, user.id, user.id).n;
  }
  req.user = user;
  res.locals.user = user;
  res.locals.unread = unread;
  res.locals.flash = readFlash(req);
  res.locals.fmt = fmt;
  res.locals.fmtShort = fmtShort;
  res.locals.timeAgo = timeAgo;
  res.locals.currentPath = req.path;
  res.locals.enc = encodeURIComponent;
  next();
});

app.use(auth.router);
app.use(posts.router);
app.use(chat.router);
app.use(admin.router);

app.get('/dev/outbox', (req, res) => {
  const messages = db.prepare('SELECT * FROM mail_outbox ORDER BY id DESC LIMIT 50').all();
  res.render('outbox', { title: 'Dev outbox', messages });
});

app.post('/dev/outbox/clear', (req, res) => {
  db.prepare('DELETE FROM mail_outbox').run();
  res.redirect('/dev/outbox');
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About' });
});

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'That page does not exist.' });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Only JPG, PNG or WEBP images up to 5 MB.') {
    return res.status(400).render('post-new', {
      title: 'Post an item',
      error: err.message,
      values: req.body || {},
      CATEGORIES: require('./shared').CATEGORIES,
      LOCATIONS: require('./shared').LOCATIONS,
      flash: null,
    });
  }
  console.error(err);
  res.status(500).render('error', { title: 'Something broke', message: 'An unexpected error occurred.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('FoundIT running at http://localhost:' + PORT);
    console.log('Dev outbox: http://localhost:' + PORT + '/dev/outbox');
  });
}

module.exports = app;
