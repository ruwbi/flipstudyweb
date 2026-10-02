/* =======================================================================
   /api/auth — registration, login, change-password, forgot-password.
   ======================================================================= */
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { readDB, writeDB } = require('../utils/db');
const { validateUsername, validateEmail, validatePassword } = require('../utils/validation');
const { welcomeEmail, verificationCodeEmail, passwordChangedEmail, demoMode } = require('../utils/email');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;
const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
  users[uname] = { email: mail, passwordHash, joined: Date.now(), tokens: [], resetCode: null };
  writeDB('users', users);

  const decks = readDB('decks');
  decks[uname] = [];
  writeDB('decks', decks);

  welcomeEmail({ username: uname, email: mail }).catch(e => console.error('[email] welcome failed:', e.message));

  res.status(201).json({ ok: true });
});

/* ---------------------------------------------------------------------
   POST /api/auth/login  { identifier, password }
   --------------------------------------------------------------------- */
router.post('/login', async (req, res) => {
  const { identifier = '', password = '' } = req.body || {};
  if(!identifier.trim()) return res.status(400).json({ error: 'Please enter your username or email' });
  if(!password) return res.status(400).json({ error: 'Please enter your password' });

  const users = readDB('users');
  const uname = findUsernameByIdentifier(users, identifier);
  const record = uname && users[uname];
  const match = record ? await bcrypt.compare(password, record.passwordHash) : false;
  if(!record || !match) return res.status(401).json({ error: 'Username/email or password is incorrect' });

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

/* ---------------------------------------------------------------------
   FORGOT PASSWORD — 3 steps, no auth required (the user is locked out).

   Step 1: POST /api/auth/forgot-password        { identifier }
   Step 2: POST /api/auth/verify-reset-code      { identifier, code }
   Step 3: POST /api/auth/reset-password         { identifier, code, newPassword }
   --------------------------------------------------------------------- */
router.post('/forgot-password', async (req, res) => {
  const { identifier = '' } = req.body || {};
  const users = readDB('users');
  const uname = findUsernameByIdentifier(users, identifier);
  if(!uname) return res.status(404).json({ error: 'No account matches that information' });

  const code = String(crypto.randomInt(100000, 1000000)); // 6 digits, 100000–999999
  users[uname].resetCode = { code, expiresAt: Date.now() + RESET_CODE_TTL_MS };
  writeDB('users', users);

  const result = await verificationCodeEmail(users[uname].email, code);
  res.json({
    ok: true,
    message: 'Verification code sent to your email. Check inbox/spam.',
    // Demo mode (no email configured): hand the code back so the flow is still testable end-to-end.
    ...(result.demoMode ? { demoMode: true, demoCode: code } : {})
  });
});

router.post('/verify-reset-code', (req, res) => {
  const { identifier = '', code = '' } = req.body || {};
  const users = readDB('users');
  const uname = findUsernameByIdentifier(users, identifier);
  const reset = uname && users[uname].resetCode;
  if(!uname || !reset) return res.status(400).json({ error: 'Invalid verification code' });
  if(Date.now() > reset.expiresAt) return res.status(400).json({ error: 'Code expired. Request a new one.' });
  if(reset.code !== String(code).trim()) return res.status(400).json({ error: 'Invalid verification code' });
  res.json({ ok: true, message: 'Verified! Create new password' });
});

router.post('/reset-password', async (req, res) => {
  const { identifier = '', code = '', newPassword = '' } = req.body || {};
  const users = readDB('users');
  const uname = findUsernameByIdentifier(users, identifier);
  const reset = uname && users[uname].resetCode;
  if(!uname || !reset) return res.status(400).json({ error: 'Invalid verification code' });
  if(Date.now() > reset.expiresAt) return res.status(400).json({ error: 'Code expired. Request a new one.' });
  if(reset.code !== String(code).trim()) return res.status(400).json({ error: 'Invalid verification code' });

  const check = validatePassword(newPassword);
  if(!check.valid) return res.status(400).json({ error: check.message });

  users[uname].passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  users[uname].resetCode = null;   // clear the used code
  users[uname].tokens = [];        // log every device out for safety
  writeDB('users', users);

  passwordChangedEmail(users[uname].email).catch(e => console.error('[email] change-notice failed:', e.message));
  res.json({ ok: true, message: 'Password reset complete! Please log in.' });
});

module.exports = router;
