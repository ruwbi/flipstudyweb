/* =======================================================================
   FlipStudy backend — main entry point.
   Run with: node server.js   (or: npm start)
   ======================================================================= */
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const deckRoutes = require('./routes/decks');
const { demoMode } = require('./utils/email');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'flipstudy-backend' }));
app.use('/api/auth', authRoutes);
app.use('/api/decks', deckRoutes);

// Optional convenience: serve the frontend files from this same server too,
// so you can run everything with one command instead of a separate static server.
app.use(express.static(require('path').join(__dirname, '..', 'frontend')));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`\n🗂️  FlipStudy backend running at http://localhost:${PORT}`);
  console.log(demoMode
    ? '📧  Email: DEMO MODE — reset codes will print here and in the API response (set EMAIL_USER/EMAIL_PASS in .env for real emails).'
    : '📧  Email: configured — sending real emails via Nodemailer.');
});
