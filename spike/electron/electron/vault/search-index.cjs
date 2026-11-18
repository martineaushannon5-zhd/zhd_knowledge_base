'use strict';

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const SEGMENTER_VERSION = 'cjk-bigram-1';

// Deterministic, dependency-free segmentation used for BOTH indexing and queries
// so they always agree. ASCII words are kept whole; CJK runs emit each character
// plus adjacent bigrams, which makes 1–2 character Chinese queries match. This is
// a baseline; Phase C may swap in jieba and must then rebuild the index.
function segment(text) {
  if (!text) return '';
  const lower = String(text).toLowerCase();
  const tokens = new Set();
  const ascii = lower.match(/[a-z0-9]+/g);
  if (ascii) for (const word of ascii) tokens.add(word);
  const cjkRuns = lower.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g);
  if (cjkRuns) {
    for (const run of cjkRuns) {
      const chars = [...run];
      for (let i = 0; i < chars.length; i += 1) {
        tokens.add(chars[i]);
        if (i + 1 < chars.length) tokens.add(chars[i] + chars[i + 1]);
      }
    }
  }
  return [...tokens].join(' ');
}

function openIndex(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      id TEXT PRIMARY KEY,
      title TEXT, category TEXT, status TEXT, sensitivity TEXT,
      favorite INTEGER, inbox INTEGER, created_at TEXT, updated_at TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED, title, body, tags, tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS index_info (key TEXT PRIMARY KEY, value TEXT);
  `);
  db.prepare('INSERT OR REPLACE INTO index_info(key, value) VALUES (?, ?)').run('segmenter', SEGMENTER_VERSION);

  function rebuild(notes) {
    const insertMeta = db.prepare('INSERT INTO meta(id,title,category,status,sensitivity,favorite,inbox,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
    const insertFts = db.prepare('INSERT INTO notes_fts(id,title,body,tags) VALUES (?,?,?,?)');
    const tx = db.transaction((items) => {
      db.exec('DELETE FROM meta; DELETE FROM notes_fts;');
      for (const note of items) {
        insertMeta.run(note.id, note.title, note.category, note.status, note.sensitivity, note.favorite ? 1 : 0, note.inbox ? 1 : 0, note.createdAt, note.updatedAt);
        insertFts.run(note.id, segment(note.title), segment(note.body), segment((note.tags || []).join(' ')));
      }
    });
    tx(notes);
  }

  function search(query, { limit = 50, includeTrashed = false } = {}) {
    const segmented = segment(query);
    if (!segmented) return [];
    const match = segmented.split(' ').filter(Boolean).map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
    const rows = db.prepare(`
      SELECT f.id AS id, m.title AS title, m.category AS category, m.updated_at AS updatedAt, bm25(notes_fts) AS rank
      FROM notes_fts f JOIN meta m ON m.id = f.id
      WHERE notes_fts MATCH ? AND m.sensitivity != 'secret' ${includeTrashed ? '' : "AND m.status != 'trashed'"}
      ORDER BY rank LIMIT ?
    `).all(match, limit);
    return rows;
  }

  function count() {
    return db.prepare('SELECT COUNT(*) AS n FROM meta').get().n;
  }

  function close() { db.close(); }

  return { rebuild, search, count, close, segmenterVersion: SEGMENTER_VERSION, db };
}

module.exports = { openIndex, segment, SEGMENTER_VERSION };
