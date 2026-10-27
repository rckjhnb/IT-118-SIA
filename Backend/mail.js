const nodemailer = require('nodemailer');
const { db } = require('./db');

const SMTP_HOST = process.env.SMTP_HOST;
const smtp = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

// Every message is recorded in mail_outbox so the flow works with no SMTP account.
// shortcut: no retry queue; if Gmail rejects a message we only log it, upgrade when real students depend on it.
async function sendMail(to, subject, body) {
  const info = db.prepare('INSERT INTO mail_outbox (to_email, subject, body, created_at) VALUES (?, ?, ?, ?)')
    .run(to, subject, body, new Date().toISOString());

  if (!smtp) return;

  try {
    await smtp.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: body,
    });
  } catch (err) {
    console.error('[mail] SMTP send failed for outbox #' + info.lastInsertRowid + ':', err.message);
  }
}

function sendCode(to, code, purpose) {
  const isReset = purpose === 'reset';
  const subject = isReset ? 'Reset your FoundIT password' : 'Verify your FoundIT account';
  const body = [
    isReset ? 'Someone asked to reset the password for your FoundIT account.' : 'Welcome to FoundIT.',
    '',
    'Your 6-digit code: ' + code,
    '',
    'This code expires in 15 minutes and can be used once.',
    'If you did not request this, ignore this email.',
  ].join('\n');
  return sendMail(to, subject, body);
}

module.exports = { sendMail, sendCode };
