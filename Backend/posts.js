const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { getDb, nextId, authorSnapshot, withId } = require('./db');
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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function listPosts(f) {
  const query = {};
  if (f.type !== 'all') query.type = f.type;
  if (f.status === 'open') query.status = 'open';
  if (f.category) query.category = f.category;
  if (f.location) query.location = f.location;
  if (f.q) {
    const pattern = new RegExp(escapeRegex(f.q), 'i');
    query.$or = [{ item_name: pattern }, { description: pattern }];
  }
  const rows = await getDb().collection('posts').find(query).sort({ _id: -1 }).limit(100).toArray();
  return rows.map(withId);
}

router.get('/posts', async (req, res) => {
  const type = String(req.query.type || 'all');
  const filters = {
    type: ['lost', 'found'].includes(type) ? type : 'all',
    status: req.query.status === 'all' ? 'all' : 'open',
    category: String(req.query.category || ''),
    location: String(req.query.location || ''),
    q: String(req.query.q || '').trim().slice(0, 100),
  };
  res.json({
    posts: await listPosts(filters),
  });
});

router.post('/posts', requireAuth, upload.single('photo'), async (req, res) => {
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

  const author = await authorSnapshot(req.session.user.id);
  const id = await nextId('posts');
  await getDb().collection('posts').insertOne({
    _id: id,
    user_id: req.session.user.id,
    ...v,
    status: 'open',
    admin_seen: false,
    created_at: new Date().toISOString(),
    image: req.file ? req.file.filename : null,
    ...author,
  });
  res.status(201).json({ ok: true, id });
});

router.get('/posts/:id', async (req, res) => {
  const db = getDb();
  const post = await db.collection('posts').findOne({ _id: Number(req.params.id) });
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const me = req.session.user || null;
  const isOwner = Boolean(me && me.id === post.user_id);
  const isAdmin = Boolean(me && me.role === 'admin');

  // Only the poster sees who has written about an item.
  let conversations = [];
  if (isOwner) {
    const rows = await db.collection('conversations').find({ post_id: post._id }).sort({ _id: 1 }).toArray();
    conversations = await Promise.all(rows.map(async (c) => {
      const other = await db.collection('users').findOne({ _id: c.other_id });
      const student = other && other.student_id
        ? await db.collection('students').findOne({ _id: other.student_id, email: other.email })
        : null;
      return {
        id: c._id,
        name: student ? student.full_name : (other ? other.email : 'Unknown'),
        message_count: await db.collection('messages').countDocuments({ conversation_id: c._id }),
      };
    }));
  }
  res.json({ post: withId(post), conversations, isOwner, canContact: Boolean(me && !isOwner), canResolve: isOwner || isAdmin });
});

router.post('/posts/:id/resolve', requireAuth, async (req, res) => {
  const db = getDb();
  const post = await db.collection('posts').findOne({ _id: Number(req.params.id) });
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the poster or an admin can close this post.' });
  }
  await db.collection('posts').updateOne({ _id: post._id }, { $set: { status: 'resolved' } });
  res.json({ ok: true });
});

router.post('/posts/:id/contact', requireAuth, async (req, res) => {
  const db = getDb();
  const post = await db.collection('posts').findOne({ _id: Number(req.params.id) });
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.user_id === req.session.user.id) return res.status(400).json({ error: 'That is your own post.' });

  let conv = await db.collection('conversations')
    .findOne({ post_id: post._id, owner_id: post.user_id, other_id: req.session.user.id });
  if (!conv) {
    const id = await nextId('conversations');
    await db.collection('conversations').insertOne({
      _id: id, post_id: post._id, owner_id: post.user_id, other_id: req.session.user.id,
      created_at: new Date().toISOString(), last_body: null, last_at: null,
    });
    conv = { _id: id };
  }
  res.json({ ok: true, conversationId: conv._id });
});

router.get('/my-posts', requireAuth, async (req, res) => {
  const rows = await getDb().collection('posts').find({ user_id: req.session.user.id }).sort({ _id: -1 }).toArray();
  res.json({ posts: rows.map(withId) });
});

module.exports = { router };
