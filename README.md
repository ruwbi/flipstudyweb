# FlipStudy — Full-Stack Flashcard App

A real Node.js/Express backend (bcrypt-hashed passwords, token sessions,
email-based password reset) behind the existing FlipStudy frontend. Decks
and cards now live on the server instead of the browser's LocalStorage,
so your data survives clearing the browser and could, in principle, be
accessed from any device once you deploy the backend somewhere.

```
flipstudy/
├── backend/            Express API (Node.js)
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── routes/
│   │   ├── auth.js     register, login, change-password, forgot-password
│   │   └── decks.js    deck & card CRUD (per logged-in user)
│   ├── middleware/
│   │   └── auth.js     verifies the bearer session token
│   ├── utils/
│   │   ├── db.js        tiny JSON-file read/write helper
│   │   ├── validation.js server-side mirror of the frontend's rules
│   │   └── email.js      Nodemailer wrapper (falls back to demo mode)
│   └── data/
│       ├── users.json   created/filled automatically
│       └── decks.json   created/filled automatically
└── frontend/           Plain HTML/CSS/JS — unchanged in design/look
    ├── index.html register.html dashboard.html add.html deck.html
    ├── study.html profile.html settings.html
    ├── app.js      ← now an API client instead of a LocalStorage shim
    └── style.css
```

## 1. Install

You need [Node.js](https://nodejs.org) 18 or later.

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` in a text editor. The defaults work as-is for local testing —
you only *need* to change something if you want real emails (see §4).

## 2. Run it

```bash
npm start
```

You should see:

```
🗂️  FlipStudy backend running at http://localhost:4000
📧  Email: DEMO MODE — reset codes will print here and in the API response...
```

The backend also serves the `frontend/` folder directly (see the
`express.static(...)` line in `server.js`), so the **whole app** is now
available at:

```
http://localhost:4000/index.html
```

Register an account, log in, create a deck, add some cards — everything
now round-trips to `backend/data/decks.json` on disk instead of your
browser's storage. Restarting the server does **not** erase your data;
only deleting the `.json` files under `backend/data/` does.

### Running frontend and backend separately (e.g. frontend on GitHub Pages)

If you'd rather host the frontend on GitHub Pages (or any static host)
and the backend somewhere else (Render, Railway, Fly.io, a VPS, etc.):

1. Deploy the `backend/` folder to your host of choice, the same way
   you'd deploy any Node app (`npm install && npm start`, or however
   your host expects it). Set `CLIENT_ORIGIN` in its environment to your
   GitHub Pages URL so CORS allows it.
2. In `frontend/index.html` (and every other `.html` page, right before
   `<script src="app.js">`), add:
   ```html
   <script>window.FLIPSTUDY_API_BASE = 'https://your-backend-url.com/api';</script>
   ```
3. Push the `frontend/` folder to GitHub Pages as usual. `server.js`'s
   `express.static` line is then unused — that's fine, just ignore it.

## 3. What's actually implemented

**Registration** — username (4–20 chars, letters/numbers/underscores),
email (format + uniqueness), password (8–32 chars, upper+lower+number+
special character) — all re-validated server-side even though the
frontend already checks live, because the server never trusts the client.
Passwords are hashed with bcrypt before anything touches disk.

**Login** — accepts a username *or* an email, same password check.

**Change password** (Settings page) — requires the current password,
verified against the stored hash, before accepting a new one.

**Forgot password** (link on the login page) — a real 3-step flow:
1. Enter username or email → server generates a 6-digit code, valid for
   15 minutes, "sent" by email (or shown directly on screen in demo mode).
2. Enter the code → server checks it matches and hasn't expired.
3. Enter a new password → server updates the hash and **logs out every
   device** for that account as a safety measure.

**Sessions** — a random token is issued on login and stored in
`localStorage`. Every API call sends it as `Authorization: Bearer <token>`.
Logging out revokes just that token; resetting your password revokes all
of them.

## 4. Turning on real email (optional)

Demo mode (the default) prints verification codes to the server console
and hands them back in the API response, so you can fully test forgot-
password without any setup. To send real emails instead:

1. In `.env`, fill in `EMAIL_USER` and `EMAIL_PASS`.
2. For Gmail specifically: turn on 2-Step Verification on that Google
   account, then create an **App Password** (Google Account → Security →
   App Passwords) and use that 16-character password as `EMAIL_PASS` —
   your normal Gmail password won't work here.
3. Restart the server. The startup banner will now say
   "📧 Email: configured — sending real emails via Nodemailer."

## 5. Notes & limitations

- **Storage**: `data/users.json` and `data/decks.json` are plain JSON
  files, read and rewritten in full on every change. Perfectly fine at
  the scale of a class project; swap `utils/db.js` for a real database
  later without touching any route logic.
- **Device/theme/sound settings** (dark mode, sound on/off, accent
  color, flip-animation speed, study streak) are intentionally kept in
  the browser's LocalStorage, not the server — they're viewer
  preferences, not account data.
- **Concurrent writes**: the JSON-file approach has no locking. Fine for
  one person testing locally; a real multi-user deployment would want a
  proper database.
