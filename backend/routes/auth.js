/* =======================================================================
   /api/auth — registration, login, change-password.
   (Forgot-password-by-email was removed on purpose — see README. Login
   is protected instead by a short lockout after repeated failed
   attempts, which is what actually stops a brute-force guess attack.)
   ======================================================================= */
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { readDB, writeDB } = require('../utils/db');
const { validateUsername, validateEmail, validatePassword } = require('../utils/validation');
const { welcomeEmail, passwordChangedEmail } = require('../utils/email');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function newToken(){ return crypto.randomBytes(24).toString('hex'); }
function publicUser(username, record){
  return { username, email: record.email, joined: record.joined };
}
/** Login accepts a username OR an email — resolves either to the stored username, or null. */
function findUsernameByIdentifier(users, identifier){
  identifier = (identifier || '').trim();
  if(!identifier) return null;
  if(users[identifier]) return identifier;
  const lower = identifier.toLowerCase();
  return Object.keys(users).find(u => (users[u].email || '').toLowerCase() === lower) || null;
}
function minutesLeft(until){ return Math.max(1, Math.ceil((until - Date.now()) / 60000)); }

/* ---------------------------------------------------------------------
   POST /api/auth/register  { username, email, password }
   --------------------------------------------------------------------- */
router.post('/register', async (req, res) => {
  const { username = '', email = '', password = '' } = req.body || {};
  const uname = username.trim(), mail = email.trim();

  if(!uname) return res.status(400).json({ error: 'Please enter your username' });
  if(!mail) return res.status(400).json({ error: 'Please enter your email address' });
  if(!password) return res.status(400).json({ error: 'Please enter your password' });

  const uCheck = validateUsername(uname);
  if(!uCheck.valid) return res.status(400).json({ error: uCheck.message });
  const eCheck = validateEmail(mail);
  if(!eCheck.valid) return res.status(400).json({ error: eCheck.message });
  const pCheck = validatePassword(password);
  if(!pCheck.valid) return res.status(400).json({ error: pCheck.message });

  const users = readDB('users');
  if(users[uname]) return res.status(409).json({ error: 'Username is taken, choose another' });
  const emailInUse = Object.values(users).some(u => (u.email || '').toLowerCase() === mail.toLowerCase());
  if(emailInUse) return res.status(409).json({ error: 'This email is already in use' });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  users[uname] = {
    email: mail, passwordHash, joined: Date.now(), tokens: [],
    failedAttempts: 0, lockedUntil: null
  };
  writeDB('users', users);

  const decks = readDB('decks');
  decks[uname] = [];
  writeDB('decks', decks);

  welcomeEmail({ username: uname, email: mail }).catch(e => console.error('[email] welcome failed:', e.message));

  res.status(201).json({ ok: true });
});

/* ---------------------------------------------------------------------
   POST /api/auth/login  { identifier, password }
   Locks the account for 15 minutes after 5 wrong passwords in a row —
   this is what actually protects against someone guessing a password,
   rather than anything to do with what characters a username allows.
   --------------------------------------------------------------------- */
router.post('/login', async (req, res) => {
  const { identifier = '', password = '' } = req.body || {};
  if(!identifier.trim()) return res.status(400).json({ error: 'Please enter your username or email' });
  if(!password) return res.status(400).json({ error: 'Please enter your password' });

  const users = readDB('users');
  const uname = findUsernameByIdentifier(users, identifier);
  const record = uname && users[uname];

  if(record && record.lockedUntil && Date.now() < record.lockedUntil){
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutesLeft(record.lockedUntil)} minute(s).` });
  }

  const match = record ? await bcrypt.compare(password, record.passwordHash) : false;

  if(!record || !match){
    if(record){
      // Only a real account's failed-attempt counter is tracked — an unknown
      // username/email just gets the same generic error, straight away.
      record.failedAttempts = (record.failedAttempts || 0) + 1;
      if(record.failedAttempts >= MAX_FAILED_ATTEMPTS){
        record.lockedUntil = Date.now() + LOCKOUT_MS;
        record.failedAttempts = 0;
        writeDB('users', users);
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutesLeft(record.lockedUntil)} minute(s).` });
      }
      writeDB('users', users);
    }
    return res.status(401).json({ error: 'Username/email or password is incorrect' });
  }

  record.failedAttempts = 0;
  record.lockedUntil = null;
  const token = newToken();
  record.tokens = [...(record.tokens || []), token];
  writeDB('users', users);

  res.json({ ok: true, token, user: publicUser(uname, record) });
});

/* ---------------------------------------------------------------------
   POST /api/auth/logout — revoke just this device's token
   --------------------------------------------------------------------- */
router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  const users = readDB('users');
  users[req.username].tokens = (users[req.username].tokens || []).filter(t => t !== token);
  writeDB('users', users);
  res.json({ ok: true });
});

/* ---------------------------------------------------------------------
   GET /api/auth/me — used on page load to confirm the stored token is
   still valid, and to fetch the current user's profile info.
   --------------------------------------------------------------------- */
router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: publicUser(req.username, req.user) });
});

/* ---------------------------------------------------------------------
   POST /api/auth/change-password  { currentPassword, newPassword }
   --------------------------------------------------------------------- */
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword = '', newPassword = '' } = req.body || {};
  const match = await bcrypt.compare(currentPassword, req.user.passwordHash);
  if(!match) return res.status(403).json({ error: 'Current password is incorrect' });

  const check = validatePassword(newPassword);
  if(!check.valid) return res.status(400).json({ error: check.message });

  const users = readDB('users');
  users[req.username].passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  writeDB('users', users);

  passwordChangedEmail(req.user.email).catch(e => console.error('[email] change-notice failed:', e.message));
  res.json({ ok: true, message: 'Password updated successfully' });
});

module.exports = router;
