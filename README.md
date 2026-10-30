# FoundIT: BU Lost & Found

```
lost-and-found/
├── Frontend/        index.html (the UI), app.js, styles.css
├── Backend/         Express + SQLite JSON API (server.js, auth.js, posts.js, chat.js, admin.js, ...)
├── package.json
└── .env.example
```

## Run it
```bash
npm install
cp .env.example .env      # then edit
npm run dev               # http://localhost:3000
```
Demo logins (development only): `juanred.delacruz24@bicol-u.edu.ph` / `Password123`, `admin@bicol-u.edu.ph` / `Password123`
(or the `ADMIN_PASSWORD` you set before the first run; the admin is created when the database is first seeded).
Without SMTP, verification codes appear at `http://localhost:3000/#/outbox`.

## Before real use
- Set `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_PASSWORD` and the `SMTP_*` values.
- Replace the demo roster in `Backend/db.js` (`STUDENTS`) with the real student list, and delete `Backend/data/app.db` so it reseeds.
- Sessions are in memory (everyone is logged out on restart). Swap in a persistent session store.
