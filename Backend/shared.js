const path = require('path');

const UPLOAD_DIR = process.env.SIA_UPLOADS || path.join(__dirname, 'uploads');
const ADMIN_EMAIL = 'admin@bicol-u.edu.ph';

const CATEGORIES = ['Electronics', 'ID / Documents', 'Bag', 'Wallet', 'Keys', 'Uniform / Clothing', 'Books / School Supplies', 'Jewelry / Accessories', 'Other'];

const LOCATIONS = [
  'Main Library',
  'IT Building',
  'Engineering Building',
  'Cafeteria',
  'University Gym',
  'Track Oval',
  'Student Center',
  'Parking Area',
  'Main Gate',
  'Other',
];

const BU_EMAIL = /^[a-z]+(?:\.[a-z]+)+[0-9]{2}@bicol-u\.edu\.ph$/;

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.status(403).render('error', { title: 'Forbidden', message: 'Admins only.' });
  next();
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function readFlash(req) {
  if (req._flash !== undefined) return req._flash;
  const f = req.session.flash;
  delete req.session.flash;
  req._flash = f || null;
  return req._flash;
}

function fmt(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtShort(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

module.exports = { UPLOAD_DIR, ADMIN_EMAIL, CATEGORIES, LOCATIONS, BU_EMAIL, requireAuth, requireAdmin, flash, readFlash, fmt, fmtShort, timeAgo };
