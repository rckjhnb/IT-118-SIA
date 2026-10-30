const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('./db');
const { UPLOAD_DIR, CATEGORIES, LOCATIONS, requireAuth } = require('./shared');

const router = express.Router();
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !file.mimetype.startsWith('image/')) {
      const err = new Error('Only JPG, PNG or WEBP images up to 5 MB.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

// Public fields only: no email addresses.
const POST_SELECT = `
  SELECT p.*, s.full_name, s.course, s.year_level, s.block,
         (SELECT filename FROM post_images WHERE post_id = p.id ORDER BY id LIMIT 1) AS image
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN students s ON s.student_id = u.student_id
`;

function listPosts(f) {
  const where = [];
  const params = [];
  if (f.type !== 'all') { where.push('p.type = ?'); params.push(f.type); }
  if (f.status === 'open') where.push("p.status = 'open'");
  if (f.category) { where.push('p.category = ?'); params.push(f.category); }
  if (f.location) { where.push('p.location = ?'); params.push(f.location); }
  if (f.q) {
    const like = '%' + f.q.replace(/[\\%_]/g, '\\$&') + '%';
    where.push("(p.item_name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  const sql = POST_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.created_at DESC LIMIT 100';
  return db.prepare(sql).all(...params);
}

router.get('/posts', (req, res) => {
  const type = String(req.query.type || 'all');
  const filters = {
    type: ['lost', 'found'].includes(type) ? type : 'all',
    status: req.query.status === 'all' ? 'all' : 'open',
    category: String(req.query.category || ''),
    location: String(req.query.location || ''),
    q: String(req.query.q || '').trim().slice(0, 100),
  };
  res.json({
    posts: listPosts(filters),
  });
});

router.post('/posts', requireAuth, upload.single('photo'), (req, res) => {
  const body = req.body || {};
  const v = {
    type: body.type === 'found' ? 'found' : 'lost',
    item_name: String(body.item_name || '').trim(),
    category: String(body.category || ''),
    description: String(body.description || '').trim(),
    location: String(body.location || ''),
    occurred_at: String(body.occurred_at || ''),
  };
  const fail = (error) => {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    return res.status(400).json({ error });
  };

  if (!v.item_name) return fail('Item name is required.');
  if (v.item_name.length > 120) return fail('Item name is too long (120 characters max).');
  if (!v.description) return fail('Tell people what the item looks like.');
  if (v.description.length > 2000) return fail('Description is too long (2000 characters max).');
  if (!CATEGORIES.includes(v.category)) return fail('Pick a category.');
  if (!LOCATIONS.includes(v.location)) return fail('Pick a campus location.');
  if (!v.occurred_at || Number.isNaN(new Date(v.occurred_at).getTime())) return fail('Enter when you lost or found it.');

  const info = db.prepare(`
    INSERT INTO posts (user_id, type, item_name, category, description, location, occurred_at, status, admin_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 0, ?)
  `).run(req.session.user.id, v.type, v.item_name, v.category, v.description, v.location, v.occurred_at, new Date().toISOString());

  if (req.file) db.prepare('INSERT INTO post_images (post_id, filename) VALUES (?, ?)').run(info.lastInsertRowid, req.file.filename);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.get('/posts/:id', (req, res) => {
  const post = db.prepare(POST_SELECT + ' WHERE p.id = ?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const me = req.session.user || null;
  const isOwner = Boolean(me && me.id === post.user_id);
  const isAdmin = Boolean(me && me.role === 'admin');

  // Only the poster sees who has written about an item.
  let conversations = [];
  if (isOwner) {
    conversations = db.prepare(`
      SELECT c.id, COALESCE(s.full_name, u.email) AS name,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
      FROM conversations c
      JOIN users u ON u.id = c.other_id
      LEFT JOIN students s ON s.student_id = u.student_id
      WHERE c.post_id = ? ORDER BY c.created_at
    `).all(post.id);
  }
  res.json({ post, conversations, isOwner, canContact: Boolean(me && !isOwner), canResolve: isOwner || isAdmin });
});

router.post('/posts/:id/resolve', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the poster or an admin can close this post.' });
  }
  db.prepare("UPDATE posts SET status = 'resolved' WHERE id = ?").run(post.id);
  res.json({ ok: true });
});

router.post('/posts/:id/contact', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.user_id === req.session.user.id) return res.status(400).json({ error: 'That is your own post.' });

  let conv = db.prepare('SELECT * FROM conversations WHERE post_id = ? AND owner_id = ? AND other_id = ?')
    .get(post.id, post.user_id, req.session.user.id);
  if (!conv) {
    const id = db.prepare('INSERT INTO conversations (post_id, owner_id, other_id, created_at) VALUES (?, ?, ?, ?)')
      .run(post.id, post.user_id, req.session.user.id, new Date().toISOString()).lastInsertRowid;
    conv = { id };
  }
  res.json({ ok: true, conversationId: conv.id });
});

router.get('/my-posts', requireAuth, (req, res) => {
  res.json({ posts: db.prepare(POST_SELECT + ' WHERE p.user_id = ? ORDER BY p.created_at DESC').all(req.session.user.id) });
});

module.exports = { router, POST_SELECT };
