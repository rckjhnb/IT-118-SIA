const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { UPLOAD_DIR, ADMIN_EMAIL } = require('./shared');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(process.env.SIA_DB || path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY,
  full_name  TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  course     TEXT NOT NULL,
  year_level INTEGER NOT NULL,
  block      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  student_id    TEXT REFERENCES students(student_id),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student',
  verified_at   TEXT,
  created_at    TEXT NOT NULL,
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  totp_last_token TEXT
);
CREATE TABLE IF NOT EXISTS codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);
CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL CHECK (type IN ('lost','found')),
  item_name   TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  location    TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  admin_seen  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS post_images (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  owner_id   INTEGER NOT NULL REFERENCES users(id),
  other_id   INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  read_at         TEXT,
  deleted_at      TEXT
);
CREATE TABLE IF NOT EXISTS auth_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mail_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_auth_events_id ON auth_events(id);
`);

// Columns added after the first release; existing databases get them without a reseed.
function addColumn(table, column, definition) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('users', 'totp_secret', 'TEXT');
addColumn('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'totp_last_token', 'TEXT');
addColumn('messages', 'deleted_at', 'TEXT');

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

function copySeedPhotos() {
  if (!fs.existsSync(SEED_IMAGE_DIR)) return;
  for (const file of fs.readdirSync(SEED_IMAGE_DIR)) {
    const target = path.join(UPLOAD_DIR, file);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(SEED_IMAGE_DIR, file), target);
  }
}

copySeedPhotos();

// Upgrade databases seeded before real photos existed.
db.prepare("UPDATE post_images SET filename = replace(filename, '.svg', '.jpg') WHERE filename LIKE 'seed-%.svg'").run();
db.prepare("DELETE FROM posts WHERE item_name LIKE 'Hardbound Notebook%'").run();
const rewordSeedPost = db.prepare(
  'UPDATE posts SET item_name = ?, description = ? WHERE id IN (SELECT post_id FROM post_images WHERE filename = ?)',
);
for (const [, , item, , description, , , image] of SEED_POSTS) rewordSeedPost.run(item, description, image);

function seed() {
  const studentCount = db.prepare('SELECT COUNT(*) AS n FROM students').get().n;
  if (studentCount > 0) return;

  const now = new Date().toISOString();

  const insertStudent = db.prepare('INSERT INTO students (student_id, full_name, email, course, year_level, block) VALUES (?, ?, ?, ?, ?, ?)');
  const insertUser = db.prepare('INSERT INTO users (email, student_id, password_hash, role, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertPost = db.prepare('INSERT INTO posts (user_id, type, item_name, category, description, location, occurred_at, status, admin_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertImage = db.prepare('INSERT INTO post_images (post_id, filename) VALUES (?, ?)');

  const seedAll = db.transaction(() => {
    for (const row of STUDENTS) insertStudent.run(...row);

    insertUser.run(ADMIN_EMAIL, null, hashPassword(ADMIN_PASSWORD), 'admin', now, now);
    for (const student of STUDENTS.slice(0, 4)) {
      insertUser.run(student[2], student[0], hashPassword(DEMO_PASSWORD), 'student', now, now);
    }

    SEED_POSTS.forEach((p, index) => {
      const [studentId, type, item, category, description, location, occurredAt, image, status] = p;
      const user = db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId);
      const createdAt = new Date(Date.now() - (SEED_POSTS.length - index) * 3600 * 1000).toISOString();
      const info = insertPost.run(user.id, type, item, category, description, location, occurredAt, status, index >= 6 ? 0 : 1, createdAt);
      insertImage.run(info.lastInsertRowid, image);
    });

    const maria = db.prepare('SELECT id FROM users WHERE student_id = ?').get('2024-00102');
    const juan = db.prepare('SELECT id FROM users WHERE student_id = ?').get('2024-00101');
    const walletPost = db.prepare("SELECT id FROM posts WHERE item_name LIKE 'Brown Leather Wallet%'").get();
    const conv = db.prepare('INSERT INTO conversations (post_id, owner_id, other_id, created_at) VALUES (?, ?, ?, ?)').run(walletPost.id, maria.id, juan.id, now);
    db.prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(conv.lastInsertRowid, juan.id, 'Hi! I think that is my wallet, the ID inside says Maria Santos. Can I pick it up at the Student Center?', new Date(Date.now() - 5400 * 1000).toISOString());
    db.prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(conv.lastInsertRowid, maria.id, 'Yes, it is with me now. I am at the Student Center until 5 PM today.', new Date(Date.now() - 4800 * 1000).toISOString());
  });

  seedAll();
}

seed();

module.exports = { db, hashPassword, checkPassword, DEMO_PASSWORD };
