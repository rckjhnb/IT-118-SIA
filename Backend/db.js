const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const { UPLOAD_DIR, ADMIN_EMAIL } = require('./shared');

const DEMO_PASSWORD = 'Password123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEMO_PASSWORD;
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  console.warn('[db] ADMIN_PASSWORD is not set; the seeded admin uses the public demo password.');
}

const STUDENTS = [
  ['2024-00101', 'Juan Red Dela Cruz', 'juanred.delacruz24@bicol-u.edu.ph', 'BS Information Technology', 2, '2A'],
  ['2024-00102', 'Maria Clara Santos', 'maria.santos24@bicol-u.edu.ph', 'BS Information Technology', 2, '2A'],
  ['2023-00233', 'Jose Rizal Mercado', 'jose.mercado23@bicol-u.edu.ph', 'BS Computer Science', 3, '3B'],
  ['2025-00312', 'Ana Liza Reyes', 'ana.reyes25@bicol-u.edu.ph', 'BS Information Systems', 1, '1C'],
  ['2026-00401', 'Paolo Miguel Ramos', 'paolo.ramos26@bicol-u.edu.ph', 'BS Civil Engineering', 1, '1A'],
  ['2023-00517', 'Kristine Joy Villanueva', 'kristine.villanueva23@bicol-u.edu.ph', 'BS Accountancy', 3, '3A'],
  ['2024-00622', 'Mark Anthony Bautista', 'mark.bautista24@bicol-u.edu.ph', 'BS Electrical Engineering', 2, '2B'],
  ['2022-00731', 'Lorna Mae Dizon', 'lorna.dizon22@bicol-u.edu.ph', 'BS Nursing', 4, '4A'],
  ['2025-00842', 'Rafael Luis Ocampo', 'rafael.ocampo25@bicol-u.edu.ph', 'BS Architecture', 1, '1B'],
  ['2023-00955', 'Bea Nicole Salazar', 'bea.salazar23@bicol-u.edu.ph', 'BA Communication', 3, '3C'],
  ['2024-01066', 'Carlo Emmanuel Nuñez', 'carlo.nunez24@bicol-u.edu.ph', 'BS Information Technology', 2, '2C'],
  ['2022-01177', 'Trisha Marie Fernandez', 'trisha.fernandez22@bicol-u.edu.ph', 'BS Biology', 4, '4B'],
];

const SEED_POSTS = [
  ['2024-00101', 'lost', 'Black Umbrella', 'Other', 'Automatic folding umbrella, black with a wooden handle. May have a small tear near one rib.', 'Main Library', '2026-10-24T09:30', 'seed-umbrella.jpg', 'open'],
  ['2024-00102', 'found', 'Student ID', 'ID / Documents', 'Student ID card inside a clear plastic sleeve. Turned over to the guard on duty.', 'Cafeteria', '2026-10-25T12:15', 'seed-id.jpg', 'open'],
  ['2023-00233', 'lost', 'Silver Wired Earphones', 'Electronics', 'Silver wired earphones with a chrome inline remote, left at a computer unit in the lab.', 'IT Building', '2026-10-25T15:45', 'seed-earphones.jpg', 'open'],
  ['2024-00102', 'found', 'Brown Leather Wallet', 'Wallet', 'Brown leather bi-fold wallet with several card slots. Kept by the Student Center office for safekeeping.', 'Student Center', '2026-10-26T08:20', 'seed-wallet.jpg', 'open'],
  ['2025-00312', 'lost', 'Scientific Calculator (Casio FX-991EX)', 'Electronics', 'Black Casio FX-991EX ClassWiz calculator. Last used during the math quiz.', 'Engineering Building', '2026-10-26T10:05', 'seed-calculator.jpg', 'open'],
  ['2024-00101', 'found', 'Set of Keys with Blue Keychain', 'Keys', 'Single key on a blue keychain with translucent blue charms and a braided cord.', 'Track Oval', '2026-10-26T16:40', 'seed-keys.jpg', 'open'],
  ['2023-00233', 'lost', 'PE Uniform Shirt', 'Uniform / Clothing', 'White PATHFIT PE shirt with blue and orange sleeves. Left hanging at the University Gym.', 'University Gym', '2026-10-26T17:55', 'seed-jacket.jpg', 'open'],
];

const SEED_IMAGE_DIR = path.join(__dirname, 'seed-images');
const COLLECTIONS = ['students', 'users', 'posts', 'conversations', 'messages', 'codes', 'auth_events', 'mail_outbox', 'counters'];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function checkPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const candidate = crypto.scryptSync(password, parts[1], 64);
  const expected = Buffer.from(parts[2], 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function copySeedPhotos() {
  if (!fs.existsSync(SEED_IMAGE_DIR)) return;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const file of fs.readdirSync(SEED_IMAGE_DIR)) {
    const target = path.join(UPLOAD_DIR, file);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(SEED_IMAGE_DIR, file), target);
  }
}

let client;
let database;

async function connect() {
  if (database) return database;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and paste your Atlas connection string.');
  }
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  database = client.db(process.env.MONGODB_DB || 'foundit');
  copySeedPhotos();
  await seedDatabase(database);
  return database;
}

function getDb() {
  if (!database) throw new Error('connect() must finish before the database is used.');
  return database;
}

async function close() {
  if (client) await client.close();
  client = undefined;
  database = undefined;
}

async function nextId(name) {
  const doc = await getDb().collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return doc.seq;
}

// Denormalised author details so the feed does not need joins on every read.
async function authorSnapshot(userId) {
  const db = getDb();
  const user = await db.collection('users').findOne({ _id: userId });
  const student = user && user.student_id
    ? await db.collection('students').findOne({ _id: user.student_id, email: user.email })
    : null;
  return {
    full_name: student ? student.full_name : null,
    course: student ? student.course : null,
    year_level: student ? student.year_level : null,
    block: student ? student.block : null,
  };
}

function withId(doc) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// Inserts the demo roster, accounts, posts and one conversation. Skips a database that already has users.
async function seedDatabase(db, { reset = false } = {}) {
  if (reset) for (const name of COLLECTIONS) await db.collection(name).drop().catch(() => {});

  if (await db.collection('users').countDocuments()) return false;

  const now = new Date().toISOString();

  await db.collection('students').insertMany(STUDENTS.map(([id, full_name, email, course, year_level, block]) => ({
    _id: id, full_name, email, course, year_level, block,
  })));

  const students = await db.collection('students').find().toArray();
  const byStudentId = new Map(students.map((s) => [s._id, s]));

  const users = [
    {
      _id: 1, email: ADMIN_EMAIL, student_id: null, password_hash: hashPassword(ADMIN_PASSWORD),
      role: 'admin', verified_at: now, created_at: now,
      totp_secret: null, totp_enabled: false, totp_last_token: null,
    },
  ];
  for (const [studentId, , email] of STUDENTS.slice(0, 4)) {
    users.push({
      _id: users.length + 1, email, student_id: studentId, password_hash: hashPassword(DEMO_PASSWORD),
      role: 'student', verified_at: now, created_at: now,
      totp_secret: null, totp_enabled: false, totp_last_token: null,
    });
  }
  await db.collection('users').insertMany(users);

  const userByStudentId = new Map(users.filter((u) => u.student_id).map((u) => [u.student_id, u]));

  const posts = SEED_POSTS.map((p, index) => {
    const [studentId, type, item_name, category, description, location, occurred_at, image, status] = p;
    const user = userByStudentId.get(studentId);
    const student = byStudentId.get(studentId);
    return {
      _id: index + 1,
      user_id: user._id,
      type,
      item_name,
      category,
      description,
      location,
      occurred_at,
      status,
      admin_seen: index >= 6 ? 0 : 1,
      created_at: new Date(Date.now() - (SEED_POSTS.length - index) * 3600 * 1000).toISOString(),
      image,
      full_name: student.full_name,
      course: student.course,
      year_level: student.year_level,
      block: student.block,
    };
  });
  await db.collection('posts').insertMany(posts);

  const maria = userByStudentId.get('2024-00102');
  const juan = userByStudentId.get('2024-00101');
  const wallet = posts.find((p) => p.item_name === 'Brown Leather Wallet');
  const messageAt = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
  const messages = [
    {
      _id: 1, conversation_id: 1, sender_id: juan._id,
      body: 'Hi! I think that is my wallet, the ID inside says Maria Santos. Can I pick it up at the Student Center?',
      created_at: messageAt(5400), read_at: null, deleted_at: null, full_name: byStudentId.get(juan.student_id).full_name,
    },
    {
      _id: 2, conversation_id: 1, sender_id: maria._id,
      body: 'Yes, it is with me now. I am at the Student Center until 5 PM today.',
      created_at: messageAt(4800), read_at: null, deleted_at: null, full_name: byStudentId.get(maria.student_id).full_name,
    },
  ];
  await db.collection('conversations').insertOne({
    _id: 1, post_id: wallet._id, owner_id: maria._id, other_id: juan._id, created_at: now,
    last_body: messages[1].body, last_at: messages[1].created_at,
  });
  await db.collection('messages').insertMany(messages);

  await db.collection('counters').insertMany([
    { _id: 'users', seq: users.length },
    { _id: 'posts', seq: posts.length },
    { _id: 'conversations', seq: 1 },
    { _id: 'messages', seq: messages.length },
    { _id: 'codes', seq: 0 },
    { _id: 'auth_events', seq: 0 },
    { _id: 'mail_outbox', seq: 0 },
  ]);

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('students').createIndex({ email: 1 }, { unique: true });
  await db.collection('messages').createIndex({ conversation_id: 1, _id: 1 });
  return true;
}

module.exports = {
  connect, close, getDb, nextId, authorSnapshot, withId, seedDatabase,
  hashPassword, checkPassword, DEMO_PASSWORD, STUDENTS, SEED_POSTS,
};
