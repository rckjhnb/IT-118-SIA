const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { POST_SELECT } = require('./posts');
const { UPLOAD_DIR, requireAdmin, flash, readFlash } = require('./shared');

const router = express.Router();

router.get('/admin', requireAdmin, (req, res) => {
  const newPosts = db.prepare(POST_SELECT + ' WHERE p.admin_seen = 0 ORDER BY p.created_at DESC').all();
  if (newPosts.length) {
    const mark = db.prepare('UPDATE posts SET admin_seen = 1 WHERE id = ?');
    db.transaction(() => newPosts.forEach((p) => mark.run(p.id)))();
  }

  const stats = {
    posts: db.prepare('SELECT COUNT(*) n FROM posts').get().n,
    open_lost: db.prepare("SELECT COUNT(*) n FROM posts WHERE type='lost' AND status='open'").get().n,
    open_found: db.prepare("SELECT COUNT(*) n FROM posts WHERE type='found' AND status='open'").get().n,
    resolved: db.prepare("SELECT COUNT(*) n FROM posts WHERE status='resolved'").get().n,
    users: db.prepare("SELECT COUNT(*) n FROM users WHERE role='student'").get().n,
    pending: db.prepare('SELECT COUNT(*) n FROM users WHERE verified_at IS NULL').get().n,
    unread_messages: db.prepare('SELECT COUNT(*) n FROM messages WHERE read_at IS NULL').get().n,
  };

  const recent = db.prepare(POST_SELECT + ' ORDER BY p.created_at DESC LIMIT 20').all();
  const users = db.prepare(`
    SELECT u.id, u.email, u.role, u.verified_at, u.created_at, s.student_id, s.full_name, s.course, s.year_level, s.block
    FROM users u LEFT JOIN students s ON s.student_id = u.student_id
    ORDER BY u.role = 'admin' DESC, u.created_at DESC
  `).all();

  res.render('admin', { title: 'Admin dashboard', newPosts, stats, recent, users, flash: readFlash(req) });
});

router.post('/admin/posts/:id/resolve', requireAdmin, (req, res, next) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return next();
  db.prepare("UPDATE posts SET status = 'resolved' WHERE id = ?").run(post.id);
  flash(req, 'ok', 'Post #' + post.id + ' marked resolved.');
  res.redirect('/admin');
});

router.post('/admin/posts/:id/remove', requireAdmin, (req, res, next) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return next();

  const images = db.prepare('SELECT filename FROM post_images WHERE post_id = ?').all(post.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  for (const image of images) {
    if (image.filename.startsWith('seed-')) continue;
    fs.rm(path.join(UPLOAD_DIR, image.filename), { force: true }, () => {});
  }

  flash(req, 'ok', 'Post #' + post.id + ' removed.');
  res.redirect('/admin');
});

module.exports = { router };
