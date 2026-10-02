/* =======================================================================
   Tiny JSON-file "database" helper.
   Each file (users.json, decks.json) holds one big object keyed by id.
   Reads/writes are synchronous and whole-file — perfectly fine at the
   scale of a class project, and trivial to later swap for a real DB
   because every route only ever calls readDB()/writeDB() from here.
   ======================================================================= */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePathFor(name){ return path.join(DATA_DIR, `${name}.json`); }

function readDB(name){
  const file = filePathFor(name);
  if(!fs.existsSync(file)) fs.writeFileSync(file, '{}');
  const raw = fs.readFileSync(file, 'utf8').trim();
  try{ return raw ? JSON.parse(raw) : {}; }
  catch(e){ console.error(`[db] ${name}.json is corrupted, starting fresh:`, e.message); return {}; }
}

function writeDB(name, data){
  fs.writeFileSync(filePathFor(name), JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };
