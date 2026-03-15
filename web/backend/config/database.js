import { createRequire } from "module";
import { join } from "path";

const require = createRequire(import.meta.url);

// Use better-sqlite3 for synchronous DB access (simpler in Express handlers)
// Falls back to a mock if the module is not installed, so the server still starts.
let Database;
try {
  Database = require("better-sqlite3");
} catch {
  console.warn(
    "[database.js] better-sqlite3 not found — running in mock mode. Install it: npm install better-sqlite3",
  );
}

const DB_PATH = join(process.cwd(), "database.sqlite");

let db;

if (Database) {
  db = new Database(DB_PATH);
  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
} else {
  // Mock db — methods are no-ops so the rest of the app can load
  db = {
    prepare: () => ({
      run: () => {},
      get: () => null,
      all: () => [],
    }),
    exec: () => {},
  };
}

/**
 * Run all DDL migrations (idempotent — uses IF NOT EXISTS).
 * Add new migrations here as new tables are needed.
 * @param {import("better-sqlite3").Database} database
 */
function runMigrations(database) {
  database.exec(`
    -- -------------------------------------------------------
    -- shops: one row per installed store
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS shops (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      shop            TEXT    UNIQUE NOT NULL,
      plan            TEXT    NOT NULL DEFAULT 'free',
      quota_used      INTEGER NOT NULL DEFAULT 0,
      quota_limit     INTEGER NOT NULL DEFAULT 20,
      overage_enabled INTEGER NOT NULL DEFAULT 1,  -- 1 = on, 0 = off
      ai_engine       TEXT    NOT NULL DEFAULT 'premium', -- premium | community | mock
      widget_config   TEXT    NOT NULL DEFAULT '{}', -- JSON blob
      created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- -------------------------------------------------------
    -- tryon_jobs: audit log for every try-on generation
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS tryon_jobs (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      shop                 TEXT    NOT NULL,
      product_id           TEXT,
      fashn_prediction_id  TEXT,
      status               TEXT    NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
      result_url           TEXT,
      error                TEXT,
      counted              INTEGER NOT NULL DEFAULT 0,         -- 1 if this job consumed quota
      created_at           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Index for fast quota count queries
    CREATE INDEX IF NOT EXISTS idx_tryon_jobs_shop_created
      ON tryon_jobs(shop, created_at);
  `);

  // Safe migration: add columns to existing databases
  try {
    database.exec(
      `ALTER TABLE shops ADD COLUMN ai_engine TEXT NOT NULL DEFAULT 'premium';`,
    );
  } catch {
    // Column already exists
  }

  try {
    database.exec(
      `ALTER TABLE tryon_jobs ADD COLUMN fashn_prediction_id TEXT;`,
    );
  } catch {
    // Column already exists — ignore
  }

  console.log("[database.js] Migrations applied ✓");
}

export { db };
export default db;
