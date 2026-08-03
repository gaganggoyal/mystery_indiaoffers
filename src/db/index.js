'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');

// DATA_DIR lets the VPS keep the DB on a backed-up volume outside the deploy dir.
const dataDir = config.paths.data;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, 'emystery.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Forward migrations for existing DBs
const addColumn = (table, col, ddl) => {
  const has = sqlite.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
  if (!has) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
};
addColumn('mystery_orders', 'product_deposit_inr', 'product_deposit_inr INTEGER DEFAULT 0');
addColumn('mystery_orders', 'return_addon', 'return_addon INTEGER DEFAULT 0');

function query(sql, params = []) {
  const stmt = sqlite.prepare(sql);
  const bound = params.map(p => (p === undefined ? null : p));
  if (stmt.reader) return Promise.resolve(stmt.all(...bound));
  const info = stmt.run(...bound);
  return Promise.resolve({ affectedRows: info.changes, insertId: Number(info.lastInsertRowid) });
}

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

module.exports = { query, nowSql, uid, sqlite };
