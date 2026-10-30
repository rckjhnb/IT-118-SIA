const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { POST_SELECT } = require('./posts');
const { UPLOAD_DIR, requireAdmin } = require('./shared');

const router = express.Router();
const n = (sql) => db.prepare(sql).get().n;

router.get('/admin', requireAdmin, (req, res) => {
  const newPosts = db.prepare(POST_SELECT + ' WHERE p.admin_seen = 0 ORDER BY p.created_at DESC').all();
  if (newPosts.length) {
    const mark = db.prepare('UPDATE posts SET admin_seen = 1 WHERE id = ?');
    db.transaction(() => newPosts.forEach((p) => mark.run(p.id)))();
  }

  const stats = {
    posts: n('SELECT COUNT(*) n FROM posts'),
    open_lost: n("SELECT COUNT(*) n FROM posts WHERE type='lost' AND status='open'"),
    open_found: n("SELECT COUNT(*) n FROM posts WHERE type='found' AND status='open'"),
    resolved: n("SELECT COUNT(*) n FROM posts WHERE status='resolved'"),
    users: n("SELECT COUNT(*) n FROM users WHERE role='student'"),
    pending: n('SELECT COUNT(*) n FROM users WHERE verified_at IS NULL'),
    unread_messages: db.prepare(`SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.read_at IS NULL AND m.sender_id != ? AND (c.owner_id = ? OR c.other_id = ?)`)
      .get(req.session.user.id, req.session.user.id, req.session.user.id).n,
  };

  const recent = db.prepare(POST_SELECT + ' ORDER BY p.created_at DESC LIMIT 20').all();
  const users = db.prepare(`
    SELECT u.id, u.email, u.role, u.verified_at, u.created_at, s.student_id, s.full_name, s.course, s.year_level, s.block
    FROM users u LEFT JOIN students s ON s.student_id = u.student_id
    ORDER BY u.role = 'admin' DESC, u.created_at DESC
  `).all();

  res.json({ newPosts, stats, recent, users });
});

router.post('/admin/posts/:id/resolve', requireAdmin, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  db.prepare("UPDATE posts SET status = 'resolved' WHERE id = ?").run(post.id);
  res.json({ ok: true });
});

router.post('/admin/posts/:id/remove', requireAdmin, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const images = db.prepare('SELECT filename FROM post_images WHERE post_id = ?').all(post.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  for (const image of images) {
    if (image.filename.startsWith('seed-')) continue;
    fs.rm(path.join(UPLOAD_DIR, path.basename(image.filename)), { force: true }, () => {});
  }
  res.json({ ok: true });
});

module.exports = { router };
