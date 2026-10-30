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
  created_at    TEXT NOT NULL
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
  read_at         TEXT
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
`);

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
  ['2024-00101', 'lost', 'Black Umbrella', 'Other', 'Automatic folding umbrella, black with a wooden handle. May have a small tear near one rib.', 'Main Library', '2026-10-24T09:30', 'seed-umbrella.svg', 'open'],
  ['2024-00102', 'found', 'Student ID - Maria Santos', 'ID / Documents', 'Blue BU ID lace with a student ID card. Name reads Maria Clara Santos. Turned over to the guard on duty.', 'Cafeteria', '2026-10-25T12:15', 'seed-id.svg', 'open'],
  ['2023-00233', 'lost', 'Silver Wired Earphones', 'Electronics', 'Silver wired earphones with a small red tape mark on the left earpiece. Left at a computer unit in the lab.', 'IT Building', '2026-10-25T15:45', 'seed-earphones.svg', 'open'],
  ['2024-00102', 'found', 'Brown Leather Wallet', 'Wallet', 'Contains cash, two IDs and a bank card. Kept by the Student Center office for safekeeping.', 'Student Center', '2026-10-26T08:20', 'seed-wallet.svg', 'open'],
  ['2025-00312', 'lost', 'Scientific Calculator (Casio FX-991)', 'Electronics', 'Casio FX-991 with name stickers on the back. Last used during the math quiz.', 'Engineering Building', '2026-10-26T10:05', 'seed-calculator.svg', 'open'],
  ['2024-00101', 'found', 'Set of Keys with Blue Keychain', 'Keys', 'Three keys on a blue carabiner keychain with a small superhero charm.', 'Track Oval', '2026-10-26T16:40', 'seed-keys.svg', 'open'],
  ['2023-00233', 'lost', 'PE Uniform Jacket', 'Uniform / Clothing', 'Maroon PE jacket, size medium, name written on the collar tag.', 'University Gym', '2026-10-26T17:55', 'seed-jacket.svg', 'open'],
  ['2025-00312', 'found', 'Hardbound Notebook with Formulas', 'Books / School Supplies', 'Green hardbound notebook full of handwritten engineering formulas. No name inside.', 'Main Library', '2026-10-27T07:50', 'seed-notebook.svg', 'resolved'],
];

const SEED_IMAGES = {
  'seed-umbrella.svg': ['#2b2b34', 'M12 4a9 9 0 0 0-9 9h18a9 9 0 0 0-9-9zm0 0v16a2 2 0 0 0 4 0'],
  'seed-id.svg': ['#1f4e79', 'M4 5h16v14H4zM7 9h6v6H7zM15 9h3v2h-3z'],
  'seed-earphones.svg': ['#8a8f98', 'M4 14a8 8 0 0 1 16 0M4 14v4M20 14v4'],
  'seed-wallet.svg': ['#7b4b2a', 'M3 7h18v12H3zM3 9h18M16 13h4'],
  'seed-calculator.svg': ['#3a3f4b', 'M6 3h12v18H6zM8 6h8v4H8zM8 13h2v2H8zM12 13h2v2h-2zM16 13h0'],
  'seed-keys.svg': ['#b08d33', 'M8 12a3 3 0 1 1 6 0 3 3 0 0 1-6 0zM14 12h6M17 12v3'],
  'seed-jacket.svg': ['#7a1f2b', 'M9 3l3 3 3-3 4 4-2 3v10H7V10L5 7z'],
  'seed-notebook.svg': ['#2f6b3f', 'M5 3h14v18H5zM8 3v18'],
};

function writeSeedImages() {
  for (const [file, [bg, d]] of Object.entries(SEED_IMAGES)) {
    const target = path.join(UPLOAD_DIR, file);
    if (fs.existsSync(target)) continue;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" width="360" height="240">
<rect width="360" height="240" fill="#f4f1ec"/>
<rect width="360" height="240" fill="${bg}" opacity="0.08"/>
<g transform="translate(84 36) scale(8)" fill="none" stroke="${bg}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
<path d="${d}"/>
</g>
<text x="180" y="222" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#8a8578">${file.replace('seed-', '').replace('.svg', '')} placeholder</text>
</svg>`;
    fs.writeFileSync(target, svg);
  }
}

function seed() {
  const studentCount = db.prepare('SELECT COUNT(*) AS n FROM students').get().n;
  if (studentCount > 0) return;

  writeSeedImages();
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
