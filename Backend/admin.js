const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb, withId } = require('./db');
const { unreadCount } = require('./auth');
const { UPLOAD_DIR, requireAdmin } = require('./shared');

const router = express.Router();

router.get('/admin', requireAdmin, async (req, res) => {
  const db = getDb();
  const posts = db.collection('posts');
  const newPosts = (await posts.find({ admin_seen: { $ne: true } }).sort({ _id: -1 }).toArray()).map(withId);
  if (newPosts.length) await posts.updateMany({ admin_seen: { $ne: true } }, { $set: { admin_seen: true } });

  const stats = {
    posts: await posts.countDocuments(),
    open_lost: await posts.countDocuments({ type: 'lost', status: 'open' }),
    open_found: await posts.countDocuments({ type: 'found', status: 'open' }),
    resolved: await posts.countDocuments({ status: 'resolved' }),
    users: await db.collection('users').countDocuments({ role: 'student' }),
    pending: await db.collection('users').countDocuments({ verified_at: null }),
    unread_messages: await unreadCount(req.session.user.id),
  };

  const recent = (await posts.find().sort({ _id: -1 }).limit(20).toArray()).map(withId);
  const events = (await db.collection('auth_events').find().sort({ _id: -1 }).limit(20).toArray()).map(withId);

  const userRows = await db.collection('users').find().sort({ role: 1, created_at: -1 }).toArray();
  const studentIds = userRows.filter((u) => u.student_id).map((u) => u.student_id);
  const students = studentIds.length
    ? await db.collection('students').find({ _id: { $in: studentIds } }).toArray()
    : [];
  const byStudent = new Map(students.map((s) => [s._id, s]));
  const users = userRows.map((u) => {
    const roster = u.student_id ? byStudent.get(u.student_id) : null;
    const s = roster && roster.email === u.email ? roster : null;
    return {
      id: u._id, email: u.email, role: u.role, verified_at: u.verified_at, created_at: u.created_at,
      student_id: s ? s._id : u.student_id,
      full_name: s ? s.full_name : null,
      course: s ? s.course : null,
      year_level: s ? s.year_level : null,
      block: s ? s.block : null,
    };
  });

  res.json({ newPosts, stats, recent, users, events });
});

// Polled by the dashboard to raise toasts without reloading.
router.get('/admin/events', requireAdmin, async (req, res) => {
  const after = Number(req.query.after) || 0;
  const rows = await getDb().collection('auth_events').find({ _id: { $gt: after } }).sort({ _id: -1 }).limit(50).toArray();
  res.json({ events: rows.map(withId) });
});

router.post('/admin/posts/:id/resolve', requireAdmin, async (req, res) => {
  const db = getDb();
  const post = await db.collection('posts').findOne({ _id: Number(req.params.id) });
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  await db.collection('posts').updateOne({ _id: post._id }, { $set: { status: 'resolved' } });
  res.json({ ok: true });
});

router.post('/admin/posts/:id/remove', requireAdmin, async (req, res) => {
  const db = getDb();
  const post = await db.collection('posts').findOne({ _id: Number(req.params.id) });
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  await db.collection('posts').deleteOne({ _id: post._id });
  const image = post.image;
  if (image && !image.startsWith('seed-')) {
    fs.rm(path.join(UPLOAD_DIR, path.basename(image)), { force: true }, () => {});
  }
  res.json({ ok: true });
});

module.exports = { router };
