const path = require('path');

const IS_PROD = process.env.NODE_ENV === 'production';
const UPLOAD_DIR = process.env.SIA_UPLOADS || path.join(__dirname, 'uploads');
const ADMIN_EMAIL = 'admin@bicol-u.edu.ph';

const CATEGORIES = ['Electronics', 'ID / Documents', 'Bag', 'Wallet', 'Keys', 'Uniform / Clothing', 'Books / School Supplies', 'Jewelry / Accessories', 'Other'];

const LOCATIONS = [
  'Main Library', 'IT Building', 'Engineering Building', 'Cafeteria', 'University Gym',
  'Track Oval', 'Student Center', 'Parking Area', 'Main Gate', 'Other',
];

const BU_EMAIL = /^[a-z]+(?:\.[a-z]+)+[0-9]{2}@bicol-u\.edu\.ph$/;

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

// shortcut: in-memory limiter, resets on restart and is per-process. Fine for one server.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip + ' ' + req.path;
    const fresh = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (fresh.length >= max) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
    fresh.push(now);
    hits.set(key, fresh);
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
    next();
  };
}

module.exports = { IS_PROD, UPLOAD_DIR, ADMIN_EMAIL, CATEGORIES, LOCATIONS, BU_EMAIL, requireAuth, requireAdmin, rateLimit };
