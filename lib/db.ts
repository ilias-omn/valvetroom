import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { hashPassword } from './auth';

const globalForDb = globalThis as unknown as { _db: Database.Database | undefined };

function initDb(): Database.Database {
  // On Netlify/serverless, use /tmp. Otherwise use local data dir.
  let dbPath: string;
  try {
    const localDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    dbPath = path.join(localDir, 'platform.db');
    // Test if we can write here
    fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
  } catch {
    dbPath = '/tmp/platform.db';
  }

  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      age_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS performers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      display_name TEXT NOT NULL,
      bio TEXT DEFAULT '',
      rate_per_minute INTEGER NOT NULL DEFAULT 10,
      is_online INTEGER NOT NULL DEFAULT 0,
      is_available INTEGER NOT NULL DEFAULT 1,
      total_earnings INTEGER NOT NULL DEFAULT 0,
      avatar_color TEXT NOT NULL DEFAULT '#ec4899',
      availability TEXT NOT NULL DEFAULT '{}',
      services TEXT NOT NULL DEFAULT '[]',
      pricing TEXT NOT NULL DEFAULT '{}',
      location TEXT NOT NULL DEFAULT '',
      tagline TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS performer_photos (
      id TEXT PRIMARY KEY,
      performer_id TEXT NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      balance INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES users(id),
      performer_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      start_time TEXT,
      end_time TEXT,
      duration_seconds INTEGER DEFAULT 0,
      tokens_charged INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL REFERENCES calls(id),
      sender_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payout_requests (
      id TEXT PRIMARY KEY,
      performer_id TEXT NOT NULL REFERENCES users(id),
      amount_tokens INTEGER NOT NULL,
      amount_usd REAL NOT NULL,
      bank_details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      performer_id TEXT NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, performer_id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES users(id),
      performer_id TEXT NOT NULL REFERENCES performers(id),
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS performer_posts (
      id TEXT PRIMARY KEY,
      performer_id TEXT NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS performer_post_media (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES performer_posts(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'image',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      performer_id TEXT NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
      amount_usd REAL NOT NULL DEFAULT 0,
      reference TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, performer_id)
    );
  `);

  // Migrations for subscriptions table (in case it was created without new columns)
  try { db.exec(`ALTER TABLE subscriptions ADD COLUMN amount_usd REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE subscriptions ADD COLUMN reference TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE subscriptions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`); } catch {}

  // Migrations for existing DBs
  try { db.exec(`ALTER TABLE performers ADD COLUMN availability TEXT NOT NULL DEFAULT '{}'`); } catch {}
  try { db.exec(`ALTER TABLE performers ADD COLUMN services TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE performers ADD COLUMN pricing TEXT NOT NULL DEFAULT '{}'`); } catch {}
  try { db.exec(`ALTER TABLE performers ADD COLUMN location TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE performers ADD COLUMN tagline TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE performers ADD COLUMN subscription_price INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN firebase_uid TEXT`); } catch {}


  // Seed admin
  try {
    const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (!adminExists) {
      const adminId = crypto.randomUUID();
      const hash = hashPassword('admin123');
      db.prepare(
        'INSERT OR IGNORE INTO users (id, username, email, password_hash, role, age_verified) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(adminId, 'admin', 'admin@platform.com', hash, 'admin', 1);
    }
  } catch {}

  // Seed demo performer
  try {
    const perfExists = db.prepare("SELECT id FROM users WHERE role = 'performer' LIMIT 1").get();
    if (!perfExists) {
      const perfUserId = crypto.randomUUID();
      const perfId = crypto.randomUUID();
      const hash = hashPassword('demo123');
      db.prepare(
        'INSERT OR IGNORE INTO users (id, username, email, password_hash, role, age_verified) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(perfUserId, 'performer1', 'performer1@platform.com', hash, 'performer', 1);
      db.prepare(
        'INSERT OR IGNORE INTO performers (id, user_id, display_name, bio, rate_per_minute, is_online, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(perfId, perfUserId, 'Sophia Rose', 'Hi! I love chatting and connecting with new people. Let\'s have fun!', 10, 1, '#ec4899');
      db.prepare('INSERT OR IGNORE INTO tokens (id, user_id, balance) VALUES (?, ?, ?)').run(
        crypto.randomUUID(), perfUserId, 0
      );

      const perf2UserId = crypto.randomUUID();
      const perf2Id = crypto.randomUUID();
      const hash2 = hashPassword('demo123');
      db.prepare(
        'INSERT OR IGNORE INTO users (id, username, email, password_hash, role, age_verified) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(perf2UserId, 'performer2', 'performer2@platform.com', hash2, 'performer', 1);
      db.prepare(
        'INSERT OR IGNORE INTO performers (id, user_id, display_name, bio, rate_per_minute, is_online, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(perf2Id, perf2UserId, 'Luna Star', 'Adventurous and playful. Let\'s make something memorable together!', 15, 0, '#db2777');
      db.prepare('INSERT OR IGNORE INTO tokens (id, user_id, balance) VALUES (?, ?, ?)').run(
        crypto.randomUUID(), perf2UserId, 0
      );
    }
  } catch {}

  return db;
}

export const db: Database.Database = (() => {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return {} as any;
  }
  try {
    return globalForDb._db ?? (globalForDb._db = initDb());
  } catch (e) {
    console.error('[DB INIT ERROR]', e);
    throw e;
  }
})();
export default db;
