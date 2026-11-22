const express = require('express');
const { getDb, nextId, withId, authorSnapshot } = require('./db');
const { requireAuth } = require('./shared');

const router = express.Router();

async function conversationFor(id, user) {
  const db = getDb();
  const conv = await db.collection('conversations').findOne({ _id: Number(id) });
  if (!conv) return null;
  // Admins only see conversations they are part of (students writing to the admin), never student-to-student ones.
  const allowed = conv.owner_id === user.id || conv.other_id === user.id;
  if (!allowed) return null;
  const post = conv.post_id ? await db.collection('posts').findOne({ _id: conv.post_id }) : null;
  return {
    ...conv,
    id: conv._id,
    item_name: post ? post.item_name : null,
    type: post ? post.type : null,
    post_status: post ? post.status : null,
  };
}

async function markRead(conversationId, userId) {
  await getDb().collection('messages').updateMany(
    { conversation_id: conversationId, sender_id: { $ne: userId }, read_at: null },
    { $set: { read_at: new Date().toISOString() } },
  );
}

async function userNames(ids) {
  const db = getDb();
  const users = await db.collection('users').find({ _id: { $in: [...new Set(ids)] } }).toArray();
  const studentIds = users.filter((u) => u.student_id).map((u) => u.student_id);
  const students = studentIds.length
    ? await db.collection('students').find({ _id: { $in: studentIds } }).toArray()
    : [];
  const byStudent = new Map(students.map((s) => [s._id, s]));
  return new Map(users.map((u) => {
    const roster = u.student_id ? byStudent.get(u.student_id) : null;
    const student = roster && roster.email === u.email ? roster : null;
    return [u._id, {
      email: u.email,
      name: student ? student.full_name : u.email,
      course: student ? student.course : null,
      year_level: student ? student.year_level : null,
      block: student ? student.block : null,
    }];
  }));
}

// Deleted text must never leave the server; the tombstone is the document itself.
const tidy = (rows) => rows.map((m) => (m.deleted_at ? { ...m, body: '' } : m));

router.get('/conversations', requireAuth, async (req, res) => {
  const db = getDb();
  const me = req.session.user;
  const isAdmin = me.role === 'admin';
  const rows = await db.collection('conversations').aggregate([
    { $match: { $or: [{ owner_id: me.id }, { other_id: me.id }] } },
    { $addFields: { sort_at: { $ifNull: ['$last_at', '$created_at'] } } },
    { $sort: { sort_at: -1 } },
  ]).toArray();

  const names = await userNames(rows.flatMap((c) => [c.owner_id, c.other_id]));
  const conversations = await Promise.all(rows.map(async (c) => {
    const post = c.post_id ? await db.collection('posts').findOne({ _id: c.post_id }) : null;
    const owner = names.get(c.owner_id) || {};
    const other = names.get(c.other_id) || {};
    return {
      id: c._id,
      post_id: c.post_id,
      owner_id: c.owner_id,
      other_id: c.other_id,
      created_at: c.created_at,
      item_name: post ? post.item_name : null,
      type: post ? post.type : null,
      owner_email: owner.email,
      other_email: other.email,
      owner_name: owner.name,
      other_name: other.name,
      last_body: c.last_body,
      last_at: c.last_at,
      unread: await db.collection('messages').countDocuments({
        conversation_id: c._id, sender_id: { $ne: me.id }, read_at: null,
      }),
    };
  }));
  res.json({ conversations, isAdmin });
});

router.post('/conversations/admin', requireAuth, async (req, res) => {
  const db = getDb();
  const me = req.session.user;
  const admin = await db.collection('users').findOne({ role: 'admin' });
  if (!admin || admin._id === me.id) return res.status(400).json({ error: 'No admin to message.' });

  let conv = await db.collection('conversations').findOne({ post_id: null, owner_id: me.id, other_id: admin._id });
  if (!conv) {
    const id = await nextId('conversations');
    await db.collection('conversations').insertOne({
      _id: id, post_id: null, owner_id: me.id, other_id: admin._id,
      created_at: new Date().toISOString(), last_body: null, last_at: null,
    });
    conv = { _id: id };
  }
  res.json({ ok: true, conversationId: conv._id });
});

router.get('/conversations/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const me = req.session.user;
  const conv = await conversationFor(req.params.id, me);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  await markRead(conv.id, me.id);
  const messages = tidy((await db.collection('messages').find({ conversation_id: conv.id }).sort({ _id: 1 }).toArray()).map(withId));
  const peerId = conv.owner_id === me.id ? conv.other_id : conv.owner_id;
  const peer = (await userNames([peerId])).get(peerId);
  res.json({ conv, messages, peer });
});

router.get('/conversations/:id/feed', requireAuth, async (req, res) => {
  const db = getDb();
  const conv = await conversationFor(req.params.id, req.session.user);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  const after = Number(req.query.after) || 0;
  const messages = tidy((await db.collection('messages')
    .find({ conversation_id: conv.id, _id: { $gt: after } }).sort({ _id: 1 }).toArray()).map(withId));
  // Every poll also reports which messages are tombstoned, so a delete by the other person lands here.
  const deleted = (await db.collection('messages')
    .find({ conversation_id: conv.id, deleted_at: { $ne: null } }, { projection: { _id: 1 } })
    .toArray()).map((m) => m._id);
  await markRead(conv.id, req.session.user.id);
  res.json({ messages, deleted });
});

router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const db = getDb();
  const conv = await conversationFor(req.params.id, req.session.user);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  const body = String((req.body || {}).body || '').trim();
  if (!body) return res.status(400).json({ error: 'Type a message first.' });
  if (body.length > 2000) return res.status(400).json({ error: 'Messages are limited to 2000 characters.' });

  const id = await nextId('messages');
  const created_at = new Date().toISOString();
  const author = await authorSnapshot(req.session.user.id);
  await db.collection('messages').insertOne({
    _id: id, conversation_id: conv.id, sender_id: req.session.user.id, body,
    created_at, read_at: null, deleted_at: null, full_name: author.full_name,
  });
  await db.collection('conversations').updateOne({ _id: conv.id }, { $set: { last_body: body, last_at: created_at } });
  res.status(201).json({ ok: true, id });
});

router.delete('/conversations/:id/messages/:messageId', requireAuth, async (req, res) => {
  const db = getDb();
  const me = req.session.user;
  const conv = await conversationFor(req.params.id, me);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  const message = await db.collection('messages').findOne({ _id: Number(req.params.messageId), conversation_id: conv.id });
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  if (message.sender_id !== me.id && me.role !== 'admin') {
    return res.status(403).json({ error: 'You can only delete your own messages.' });
  }

  const deleted_at = message.deleted_at || new Date().toISOString();
  await db.collection('messages').updateOne({ _id: message._id }, { $set: { deleted_at } });

  // The preview is denormalised, so refresh it when the tombstoned message was the last one.
  const last = await db.collection('messages').findOne({ conversation_id: conv.id }, { sort: { _id: -1 } });
  if (last) {
    await db.collection('conversations').updateOne({ _id: conv.id }, {
      $set: { last_body: last.deleted_at ? 'Message deleted' : last.body, last_at: last.created_at },
    });
  }
  res.json({ ok: true, id: message._id, deleted_at });
});

module.exports = { router };
