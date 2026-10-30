const express = require('express');
const { db } = require('./db');
const { requireAuth, flash, readFlash, ADMIN_EMAIL } = require('./shared');

const router = express.Router();

function conversationFor(id, user) {
  const conv = db.prepare(`
    SELECT c.*, p.item_name, p.type, p.status AS post_status
    FROM conversations c LEFT JOIN posts p ON p.id = c.post_id
    WHERE c.id = ?
  `).get(id);
  if (!conv) return null;
  const allowed = user.role === 'admin' || conv.owner_id === user.id || conv.other_id === user.id;
  return allowed ? conv : null;
}

function markRead(conversationId, userId) {
  db.prepare('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL')
    .run(new Date().toISOString(), conversationId, userId);
}

router.get('/messages', requireAuth, (req, res) => {
  const me = req.session.user;
  const isAdmin = me.role === 'admin';
  const conversations = db.prepare(`
    SELECT c.id, c.post_id, c.created_at,
           p.item_name, p.type,
           ou.email AS owner_email, ot.email AS other_email,
           os.full_name AS owner_name, ts.full_name AS other_name,
           (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
    FROM conversations c
    LEFT JOIN posts p ON p.id = c.post_id
    JOIN users ou ON ou.id = c.owner_id
    JOIN users ot ON ot.id = c.other_id
    LEFT JOIN students os ON os.student_id = ou.student_id
    LEFT JOIN students ts ON ts.student_id = ot.student_id
    WHERE ? = 1 OR c.owner_id = ? OR c.other_id = ?
    ORDER BY COALESCE(last_at, c.created_at) DESC
  `).all(me.id, isAdmin ? 1 : 0, me.id, me.id);

  res.render('messages', { title: 'Messages', conversations, me, isAdmin, flash: readFlash(req) });
});

router.post('/messages/admin', requireAuth, (req, res) => {
  const me = req.session.user;
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin || admin.id === me.id) return res.redirect('/messages');

  let conv = db.prepare('SELECT * FROM conversations WHERE post_id IS NULL AND owner_id = ? AND other_id = ?').get(me.id, admin.id);
  if (!conv) {
    const id = db.prepare('INSERT INTO conversations (post_id, owner_id, other_id, created_at) VALUES (NULL, ?, ?, ?)')
      .run(me.id, admin.id, new Date().toISOString()).lastInsertRowid;
    conv = { id };
  }
  res.redirect('/messages/' + conv.id);
});

router.get('/messages/:id', requireAuth, (req, res, next) => {
  const conv = conversationFor(req.params.id, req.session.user);
  if (!conv) return next();

  markRead(conv.id, req.session.user.id);

  const messages = db.prepare(`
    SELECT m.*, s.full_name, u.email
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN students s ON s.student_id = u.student_id
    WHERE m.conversation_id = ? ORDER BY m.id
  `).all(conv.id);

  const me = req.session.user;
  const peerId = conv.owner_id === me.id ? conv.other_id : conv.owner_id;
  const peer = db.prepare(`
    SELECT u.email, s.full_name, s.course, s.year_level, s.block
    FROM users u LEFT JOIN students s ON s.student_id = u.student_id WHERE u.id = ?
  `).get(peerId);

  res.render('message-thread', { title: 'Conversation', conv, messages, me, peer, ADMIN_EMAIL, flash: readFlash(req) });
});

router.get('/messages/:id/feed', requireAuth, (req, res, next) => {
  const conv = conversationFor(req.params.id, req.session.user);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const after = Number(req.query.after || 0);
  const messages = db.prepare(`
    SELECT m.id, m.sender_id, m.body, m.created_at, s.full_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN students s ON s.student_id = u.student_id
    WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.id
  `).all(conv.id, after);
  markRead(conv.id, req.session.user.id);
  res.json({ me: req.session.user.id, messages });
});

router.post('/messages/:id', requireAuth, (req, res, next) => {
  const conv = conversationFor(req.params.id, req.session.user);
  if (!conv) return next();

  const body = String(req.body.body || '').trim();
  if (!body) {
    flash(req, 'err', 'Type a message first.');
    return res.redirect('/messages/' + conv.id);
  }
  if (body.length > 2000) {
    flash(req, 'err', 'Messages are limited to 2000 characters.');
    return res.redirect('/messages/' + conv.id);
  }

  db.prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(conv.id, req.session.user.id, body, new Date().toISOString());

  if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    return res.json({ ok: true });
  }
  res.redirect('/messages/' + conv.id + '#bottom');
});

module.exports = { router };
