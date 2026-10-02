/* =======================================================================
   requireAuth — protects routes behind a valid session token.
   The frontend sends: Authorization: Bearer <token>
   Tokens are plain random strings stored against the user record in
   users.json (see routes/auth.js). No JWT library needed for a project
   this size — a looked-up opaque token is simpler to reason about and
   just as secure, since it can be revoked instantly (e.g. on logout).
   ======================================================================= */
const { readDB } = require('../utils/db');

function requireAuth(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({ error: 'Not authenticated' });

  const users = readDB('users');
  const username = Object.keys(users).find(u => (users[u].tokens || []).includes(token));
  if(!username) return res.status(401).json({ error: 'Session expired, please log in again' });

  req.username = username;
  req.user = users[username];
  next();
}

module.exports = requireAuth;
