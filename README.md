# FoundIT: BU Lost & Found

Campus lost-and-found for Bicol University. The UI is a React + TypeScript single-page app; the backend is an Express + SQLite JSON API.

```
Web/                 React + TypeScript + Tailwind frontend (Vite)
Backend/             server.js, db.js, auth.js, posts.js, chat.js, admin.js, mail.js, shared.js
Backend/check.cjs    end-to-end self-check
Frontend/            legacy vanilla app (only served if Web/dist is missing)
```

## Run it

```bash
npm install
npm --prefix Web install
npm run web:build   # writes Web/dist, which the server serves
npm start           # or: npm run dev (restarts on file changes)
```

Open <http://localhost:3000>.

For frontend development with hot reload, run `npm run web:dev` (Vite on <http://localhost:5173>) alongside the backend. The dev server proxies `/api` and `/uploads` to port 3000.

Optional configuration: copy `.env.example` to `.env` and edit it. Without a `.env`, the app still runs on port 3000 with dev defaults.

Demo logins (development only):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@bicol-u.edu.ph` | `Password123` |
| Student | `maria.santos24@bicol-u.edu.ph` | `Password123` |
| Student | `juanred.delacruz24@bicol-u.edu.ph` | `Password123` |

The admin also needs an authenticator code. On the first admin login the app shows a QR code: scan it with Google Authenticator (or any TOTP app) and enter the 6-digit code to finish setup. Later logins ask for the code after the password. To redo setup, set `totp_enabled = 0` and `totp_secret = NULL` for the admin row, or delete `Backend/data/app.db` (which also resets everything else).

To test signup, use an unregistered roster student, e.g. `paolo.ramos26@bicol-u.edu.ph` with Student ID `2026-00401`. Without SMTP, verification codes appear at <http://localhost:3000/outbox>.

## What it does

- **Verified signup.** The email must match `firstname.lastnameYY@bicol-u.edu.ph` *and* pair with the student ID in the roster. Name, course, year and block come from the roster, so students cannot type a fake name. A 6-digit code must be entered before login.
- **Forgot password.** Emails a 6-digit reset code that expires in 15 minutes and works once.
- **Posts.** Lost or found, with photo (JPG/PNG/WEBP up to 5 MB), category, description, date and time, and campus location.
- **Browse and filter.** By lost/found, search text, category, location, and open-only / returned.
- **Messaging.** Per-post conversations plus a "Message an admin" thread, with 3-second polling and unread badges. You can delete your own messages (admins can delete any); both sides see "This message was deleted" instead of the text.
- **Admin 2FA.** Admin login requires a TOTP code from Google Authenticator (or Authy and friends) after the password. Codes are verified on the server; a used code cannot be replayed.
- **Admin dashboard.** New-report feed (badge clears when opened), statistics, resolve/remove posts, account list, admin conversations, and a permanent sign-in/sign-out activity log with live toasts.
- **Responsive.** Phone, tablet, landscape and desktop layouts, sized with `dvh` so the chat thread and composer stay usable.
- **API.** Everything is under `/api` (`/api/me`, `/api/posts`, `/api/conversations`, `/api/admin`, `/api/admin/events`, `/api/2fa/*`, ...). The built React app is served from `Web/dist` at `/`.

## Self-check

```bash
npm run check
```

Runs the app against a throwaway database and walks the real API flows: roster signup validation, code verification, photo post creation, contact → message → polling feed, message tombstone deletion, admin 2FA enrollment and replay rejection, the sign-in activity log, access control, admin notification/resolve, and password reset. It cleans up after itself.

## Before real use

- Set `NODE_ENV=production`, `SESSION_SECRET` and `ADMIN_PASSWORD`, and configure `SMTP_*` so codes are actually delivered.
- Replace the demo roster in `Backend/db.js` (`STUDENTS`) with the real student list, then delete `Backend/data/app.db` so it reseeds.
- Sessions are stored in memory: restarting the server logs everyone out. Swap in a persistent session store.
- TOTP secrets are stored in plain text in SQLite. Encrypt them at rest if the database is not fully trusted.
- If the admin loses the authenticator device there is no self-service recovery: reset the `users` row (or the database) from the server.
- The database and uploaded photos live in `Backend/data/` and `Backend/uploads/` (git-ignored). On a host with an ephemeral filesystem, attach a persistent disk.
