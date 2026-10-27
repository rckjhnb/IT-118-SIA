const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('./db');
const { UPLOAD_DIR, CATEGORIES, LOCATIONS, requireAuth, flash, readFlash } = require('./shared');

const router = express.Router();

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !file.mimetype.startsWith('image/')) return cb(new Error('Only JPG, PNG or WEBP images up to 5 MB.'));
    cb(null, true);
  },
});

const POST_SELECT = `
  SELECT p.*, u.id AS user_id, s.full_name, s.course, s.year_level, s.block,
         (SELECT filename FROM post_images WHERE post_id = p.id ORDER BY id LIMIT 1) AS image
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN students s ON s.student_id = u.student_id
`;

function listPosts(filters) {
  const where = [];
  const params = [];
  if (filters.type && filters.type !== 'all') { where.push('p.type = ?'); params.push(filters.type); }
  if (filters.status === 'open') where.push("p.status = 'open'");
  if (filters.category) { where.push('p.category = ?'); params.push(filters.category); }
  if (filters.location) { where.push('p.location = ?'); params.push(filters.location); }
  if (filters.q) { where.push('(p.item_name LIKE ? OR p.description LIKE ?)'); params.push('%' + filters.q + '%', '%' + filters.q + '%'); }
  const sql = POST_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.created_at DESC LIMIT 100';
  return db.prepare(sql).all(...params);
}

router.get('/', (req, res) => {
  const filters = {
    type: String(req.query.type || 'all'),
    status: String(req.query.status || 'open'),
    category: String(req.query.category || ''),
    location: String(req.query.location || ''),
    q: String(req.query.q || '').trim(),
  };
  if (!['all', 'lost', 'found'].includes(filters.type)) filters.type = 'all';
  const posts = listPosts(filters);
  const counts = {
    lost: db.prepare("SELECT COUNT(*) n FROM posts WHERE type='lost' AND status='open'").get().n,
    found: db.prepare("SELECT COUNT(*) n FROM posts WHERE type='found' AND status='open'").get().n,
    resolved: db.prepare("SELECT COUNT(*) n FROM posts WHERE status='resolved'").get().n,
  };
  res.render('index', { title: 'FoundIT', posts, filters, counts, CATEGORIES, LOCATIONS, flash: readFlash(req) });
});

router.get('/posts/new', requireAuth, (req, res) => {
  res.render('post-new', { title: 'Post an item', error: null, values: {}, CATEGORIES, LOCATIONS, flash: readFlash(req) });
});

router.post('/posts', requireAuth, upload.single('photo'), (req, res) => {
  const body = req.body || {};
  const values = {
    type: body.type === 'found' ? 'found' : 'lost',
    item_name: String(body.item_name || '').trim(),
    category: String(body.category || ''),
    description: String(body.description || '').trim(),
    location: String(body.location || ''),
    occurred_at: String(body.occurred_at || ''),
  };
  const fail = (error) => res.status(400).render('post-new', { title: 'Post an item', error, values, CATEGORIES, LOCATIONS, flash: null });

  if (!values.item_name) return fail('Item name is required.');
  if (!values.description) return fail('Tell people what the item looks like.');
  if (!CATEGORIES.includes(values.category)) return fail('Pick a category.');
  if (!LOCATIONS.includes(values.location)) return fail('Pick a campus location.');
  if (!values.occurred_at || Number.isNaN(new Date(values.occurred_at).getTime())) return fail('Enter when you lost or found it.');

  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO posts (user_id, type, item_name, category, description, location, occurred_at, status, admin_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 0, ?)
  `).run(req.session.user.id, values.type, values.item_name, values.category, values.description, values.location, values.occurred_at, now);

  if (req.file) {
    db.prepare('INSERT INTO post_images (post_id, filename) VALUES (?, ?)').run(info.lastInsertRowid, req.file.filename);
  }

  flash(req, 'ok', 'Posted. The admin has been notified.');
  res.redirect('/posts/' + info.lastInsertRowid);
});

router.get('/posts/:id', (req, res, next) => {
  const post = db.prepare(POST_SELECT + ' WHERE p.id = ?').get(req.params.id);
  if (!post) return next();
  const messages = db.prepare(`
    SELECT c.id, c.owner_id, c.other_id, u.email,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
    FROM conversations c JOIN users u ON u.id = c.other_id
    WHERE c.post_id = ? ORDER BY c.created_at
  `).all(post.id);
  const me = req.session.user || null;
  const canContact = me && me.id !== post.user_id;
  const isOwner = me && me.id === post.user_id;
  res.render('post-show', { title: post.item_name, post, messages, me, canContact, isOwner, flash: readFlash(req) });
});

router.post('/posts/:id/resolve', requireAuth, (req, res, next) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return next();
  if (post.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Only the poster or an admin can close this post.' });
  }
  db.prepare("UPDATE posts SET status = 'resolved' WHERE id = ?").run(post.id);
  flash(req, 'ok', 'Marked as resolved.');
  res.redirect('/posts/' + post.id);
});

router.post('/posts/:id/contact', requireAuth, (req, res, next) => {
  const post = db.prepare(POST_SELECT + ' WHERE p.id = ?').get(req.params.id);
  if (!post) return next();
  if (post.user_id === req.session.user.id) {
    flash(req, 'err', 'That is your own post.');
    return res.redirect('/posts/' + post.id);
  }

  let conversation = db.prepare('SELECT * FROM conversations WHERE post_id = ? AND owner_id = ? AND other_id = ?')
    .get(post.id, post.user_id, req.session.user.id);
  if (!conversation) {
    const id = db.prepare('INSERT INTO conversations (post_id, owner_id, other_id, created_at) VALUES (?, ?, ?, ?)')
      .run(post.id, post.user_id, req.session.user.id, new Date().toISOString()).lastInsertRowid;
    conversation = { id };
  }
  res.redirect('/messages/' + conversation.id);
});

router.get('/my-posts', requireAuth, (req, res) => {
  const posts = db.prepare(POST_SELECT + ' WHERE p.user_id = ? ORDER BY p.created_at DESC').all(req.session.user.id);
  res.render('my-posts', { title: 'My posts', posts, flash: readFlash(req) });
});

module.exports = { router, POST_SELECT, upload };
