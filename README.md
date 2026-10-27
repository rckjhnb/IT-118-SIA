# FoundIT (IT-118-SIA)

Campus lost-and-found for Bicol University. Students sign up with a BU email and student ID, verify the address with a code, post items they lost or found, message the other person, and an admin watches every new report.

## Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>. The SQLite database is created and seeded on first run — nothing else to configure.

Demo accounts (seed data):

| Role | Email | Password |
| --- | --- | --- |
| Student | `maria.santos24@bicol-u.edu.ph` | `Password123` |
| Student | `juanred.delacruz24@bicol-u.edu.ph` | `Password123` |
| Admin | `admin@bicol-u.edu.ph` | `Password123` |

To register a new account, use one of the unregistered seeded students, for example `paolo.ramos26@bicol-u.edu.ph` with Student ID `2026-00401`. Verification codes appear in the **Dev outbox** (`/dev/outbox`) unless SMTP is configured.

## What it does

- **Verified signup.** The email must look like `firstname.lastnameYY@bicol-u.edu.ph` *and* match a roster row together with the student ID. Name, course, year and block are read from that row, so a user cannot type a fake name. A 6-digit code sent to the BU address must be entered before the account can log in.
- **Sessions.** Log in / log out with an 8-hour session cookie.
- **Forgot password.** Emails a 6-digit reset code; the code expires in 15 minutes, works once, and the old password stops working after the reset.
- **Posts.** Lost or found, with photo (JPG/PNG/WEBP up to 5 MB), item name, category, description, date and time, and campus location. Reporter details are filled in automatically.
- **Browse and filter.** By lost/found, search text, category, location, and open-only.
- **Messaging.** Per-post conversations between the poster and the person who contacted them, plus a "Message an admin" thread. Refreshes every 3 seconds by polling; unread badges in the nav.
- **Admin dashboard.** New-report feed (badge clears when opened), statistics, resolve/remove posts, account list with verification state, and access to every conversation.

## Project layout

```
Backend/
  server.js        Express app, session, view locals, error handling
  db.js            schema, password hashing, seed data
  auth.js          signup, verify, login, logout, forgot/reset
  posts.js         feed, post detail, create with upload, resolve, contact
  chat.js          conversation list, thread, polling feed, send
  admin.js         dashboard, resolve/remove actions
  mail.js          outbox + optional SMTP
  shared.js        constants, validators, middleware, formatting
  views/           EJS templates
  uploads/         uploaded photos and seeded placeholders
  data/app.db      SQLite database (git-ignored)
  check.cjs        end-to-end self-check
Frontedn/
  styles.css       all styling
  app.js           photo preview + chat polling
```

## Email (optional)

Codes are always written to the dev outbox. To also deliver them for real, copy `.env.example` to `.env` and fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (Gmail needs 2-Step Verification and an App Password). Gmail is only the sender; the student's BU address is the receiver.

## Self-check

```bash
npm run check
```

Runs the app against a throwaway database and walks the real flows: signup validation (bad domain, mismatched ID, unknown roster email), code verification, photo post creation, contact + message + polling feed, admin access control, admin notification and resolve, and password reset. It prints one line per failure.

## Prototype limits

- The student roster is seeded fake data; real identity guarantees need a registrar feed.
- Sessions live in memory: restarting the server logs everyone out.
- No CSRF tokens; fine for a local demo, add them before deploying publicly.
- Photos are stored on disk and never scanned.
- Polling, not websockets; no live typing indicators.
