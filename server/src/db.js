import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fit TEXT NOT NULL DEFAULT 'cover',
  image_seconds INTEGER NOT NULL DEFAULT 10,
  sound INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  kind TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  storage_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  media_id TEXT REFERENCES media(id) ON DELETE CASCADE,
  board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  duration_seconds INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT,
  secret_hash TEXT NOT NULL,
  pairing_code TEXT UNIQUE,
  playlist_id TEXT REFERENCES playlists(id) ON DELETE SET NULL,
  fit TEXT,
  last_seen_at TEXT,
  paired_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_screens_tenant ON screens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id);
CREATE INDEX IF NOT EXISTS idx_items_playlist ON playlist_items(playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_boards_tenant ON boards(tenant_id);
`;

function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(playlist_items)').all();
  const media = cols.find((column) => column.name === 'media_id');
  const hasBoard = cols.some((column) => column.name === 'board_id');
  if (media && Number(media.notnull) === 1) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      CREATE TABLE playlist_items_v2 (
        id TEXT PRIMARY KEY,
        playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        media_id TEXT REFERENCES media(id) ON DELETE CASCADE,
        board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        duration_seconds INTEGER,
        created_at TEXT NOT NULL
      );
      INSERT INTO playlist_items_v2 (id, playlist_id, media_id, position, duration_seconds, created_at)
      SELECT id, playlist_id, media_id, position, duration_seconds, created_at FROM playlist_items;
      DROP TABLE playlist_items;
      ALTER TABLE playlist_items_v2 RENAME TO playlist_items;
      CREATE INDEX IF NOT EXISTS idx_items_playlist ON playlist_items(playlist_id, position);
    `);
    db.exec('PRAGMA foreign_keys = ON');
    return;
  }
  if (!hasBoard) db.exec('ALTER TABLE playlist_items ADD COLUMN board_id TEXT');
}

function ensureColumn(db, table, name, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function ensureBrand(db) {
  ensureColumn(db, 'tenants', 'logo_media_id', 'logo_media_id TEXT');
  ensureColumn(db, 'tenants', 'tagline', "tagline TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'tenants', 'color_navy', "color_navy TEXT NOT NULL DEFAULT '#00204E'");
  ensureColumn(db, 'tenants', 'color_accent', "color_accent TEXT NOT NULL DEFAULT '#0087FF'");
  ensureColumn(db, 'tenants', 'color_ink', "color_ink TEXT NOT NULL DEFAULT '#8FD3FF'");
  ensureColumn(db, 'tenants', 'odoo_token', 'odoo_token TEXT');
}

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'pantalla.db'));
  db.exec(SCHEMA);
  migrate(db);
  ensureBrand(db);
  return db;
}

export function one(statement, ...params) {
  const value = statement.get(...params);
  return value ? { ...value } : null;
}

export function many(statement, ...params) {
  return statement.all(...params).map((item) => ({ ...item }));
}
