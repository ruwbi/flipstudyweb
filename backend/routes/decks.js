/* =======================================================================
   /api/decks — every route here requires a valid session token and only
   ever reads/writes the calling user's own deck list (decks.json is
   keyed by username, same shape the old LocalStorage version used, so
   the data model the frontend already expects didn't have to change).
   ======================================================================= */
const express = require('express');
const crypto = require('crypto');
const { readDB, writeDB } = require('../utils/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth); // every route below needs a logged-in user

const uid = () => 'id' + crypto.randomBytes(5).toString('hex');

function myDecks(req){
  const decks = readDB('decks');
  if(!decks[req.username]) decks[req.username] = [];
  return { decks, mine: decks[req.username] };
}
function findDeck(mine, id){ return mine.find(d => d.id === id); }

/* GET /api/decks — list all of the current user's decks */
router.get('/', (req, res) => {
  const { mine } = myDecks(req);
  res.json({ ok: true, decks: mine });
});

/* POST /api/decks  { name, color } */
router.post('/', (req, res) => {
  const { name = '', color = '#3f6ff0' } = req.body || {};
  if(!name.trim()) return res.status(400).json({ error: 'Please enter a deck name.' });
  const { decks, mine } = myDecks(req);
  const deck = { id: uid(), name: name.trim(), color, lastStudied: null, cards: [] };
  mine.push(deck);
  writeDB('decks', decks);
  res.status(201).json({ ok: true, deck });
});

/* PATCH /api/decks/:id  { name?, color? } */
router.patch('/:id', (req, res) => {
  const { decks, mine } = myDecks(req);
  const deck = findDeck(mine, req.params.id);
  if(!deck) return res.status(404).json({ error: 'Deck not found' });
  if(req.body.name !== undefined && req.body.name.trim()) deck.name = req.body.name.trim();
  if(req.body.color !== undefined) deck.color = req.body.color;
  writeDB('decks', decks);
  res.json({ ok: true, deck });
});

/* PATCH /api/decks/:id/studied — stamp "last studied" to now */
router.patch('/:id/studied', (req, res) => {
  const { decks, mine } = myDecks(req);
  const deck = findDeck(mine, req.params.id);
  if(!deck) return res.status(404).json({ error: 'Deck not found' });
  deck.lastStudied = Date.now();
  writeDB('decks', decks);
  res.json({ ok: true, deck });
});

/* POST /api/decks/:id/duplicate */
router.post('/:id/duplicate', (req, res) => {
  const { decks, mine } = myDecks(req);
  const deck = findDeck(mine, req.params.id);
  if(!deck) return res.status(404).json({ error: 'Deck not found' });
  const copy = {
    id: uid(), name: deck.name + ' (Copy)', color: deck.color, lastStudied: null,
    cards: deck.cards.map(c => ({ ...c, id: uid() }))
  };
  mine.push(copy);
  writeDB('decks', decks);
  res.status(201).json({ ok: true, deck: copy });
});

/* DELETE /api/decks/:id */
router.delete('/:id', (req, res) => {
  const { decks, mine } = myDecks(req);
  const idx = mine.findIndex(d => d.id === req.params.id);
  if(idx === -1) return res.status(404).json({ error: 'Deck not found' });
  mine.splice(idx, 1);
  writeDB('decks', decks);
  res.json({ ok: true });
});

/* POST /api/decks/:id/cards  { term, def } */
router.post('/:id/cards', (req, res) => {
  const { term = '', def = '' } = req.body || {};
  if(!term.trim() || !def.trim()) return res.status(400).json({ error: 'Both a term and a definition are required.' });
  const { decks, mine } = myDecks(req);
  const deck = findDeck(mine, req.params.id);
  if(!deck) return res.status(404).json({ error: 'Deck not found' });
  const card = { id: uid(), term: term.trim(), def: def.trim(), learned: false };
  deck.cards.push(card);
  writeDB('decks', decks);
  res.status(201).json({ ok: true, card });
});

/* PATCH /api/decks/:id/cards/:cardId  { term?, def?, learned? } */
router.patch('/:id/cards/:cardId', (req, res) => {
  const { decks, mine } = myDecks(req);
  const deck = findDeck(mine, req.params.id);
  const card = deck && deck.cards.find(c => c.id === req.params.cardId);
  if(!card) return res.status(404).json({ error: 'Card not found' });
  if(req.body.term !== undefined) card.term = req.body.term.trim();
  if(req.body.def !== undefined) card.def = req.body.def.trim();
  if(req.body.learned !== undefined) card.learned = !!req.body.learned;
  writeDB('decks', decks);
  res.json({ ok: true, card });
});

/* PATCH /api/decks/:id/cards/:cardId/move  { toDeckId } */
router.patch('/:id/cards/:cardId/move', (req, res) => {
  const { toDeckId } = req.body || {};
  const { decks, mine } = myDecks(req);
  const from = findDeck(mine, req.params.id);
  const to = findDeck(mine, toDeckId);
  if(!from || !to) return res.status(404).json({ error: 'Deck not found' });
  const idx = from.cards.findIndex(c => c.id === req.params.cardId);
  if(idx === -1) return res.status(404).json({ error: 'Card not found' });
  const [card] = from.cards.splice(idx, 1);
  to.cards.push(card);
  writeDB('decks', decks);
  res.json({ ok: true });
});

/* DELETE /api/decks/:id/cards/:cardId */
router.delete('/:id/cards/:cardId', (req, res) => {
  const { decks, mine } = myDecks(req);
  const deck = findDeck(mine, req.params.id);
  if(!deck) return res.status(404).json({ error: 'Deck not found' });
  deck.cards = deck.cards.filter(c => c.id !== req.params.cardId);
  writeDB('decks', decks);
  res.json({ ok: true });
});

module.exports = router;
