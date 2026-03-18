/**
 * database.js — MySQL connection pool via mysql2/promise.
 *
 * DATABASE_URL is read lazily inside initDatabase() so that dotenv.config()
 * has already executed by the time we check process.env.
 *
 * Usage:
 *   1. Call `await initDatabase()` in index.js after dotenv.config()
 *   2. Import `pool` anywhere else for query execution
 *
 * Add to .env:
 *   DATABASE_URL=mysql://user:pass@localhost:3306/fitly_db
 */
import mysql from "mysql2/promise";

// pool is populated by initDatabase()
let pool = null;

/**
 * Initialize the MySQL pool and run DDL migrations.
 * Must be called AFTER dotenv.config() — typically in web/index.js.
 * Safe to call multiple times (no-op after first successful call).
 */
export async function initDatabase() {
  if (pool) return pool;

  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL || DATABASE_URL.includes("user:password") || DATABASE_URL.includes("user:pass@host")) {
    console.warn(
      "[database.js] DATABASE_URL not configured — running in mock mode. " +
      "Add DATABASE_URL=mysql://root:@127.0.0.1:3306/fitly_db to .env",
    );
    // Mock pool — all queries return empty results so the app doesn't crash
    pool = {
      execute: async () => [[null], []],
      query:   async () => [[null], []],
    };
    return pool;
  }

  try {
    pool = mysql.createPool(DATABASE_URL);
    console.log("[database.js] MySQL pool created ✓");
    await runMigrations();
  } catch (err) {
    console.error("[database.js] Failed to connect to MySQL:", err.message);
    console.warn("[database.js] Falling back to mock mode.");
    pool = {
      execute: async () => [[null], []],
      query:   async () => [[null], []],
    };
  }

  return pool;
}

/**
 * Proxy getter — returns the current pool (or mock if not yet initialized).
 * Modules that import `pool` directly will get this proxy.
 */
const poolProxy = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!pool) {
        throw new Error(
          "[database.js] Pool not initialized. Call initDatabase() first.",
        );
      }
      return pool[prop];
    },
  },
);

/**
 * Run all DDL migrations (idempotent — IF NOT EXISTS).
 */
async function runMigrations() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS shops (
      id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      shop            VARCHAR(255) UNIQUE NOT NULL,
      plan            VARCHAR(50)  NOT NULL DEFAULT 'free',
      quota_used      INT          NOT NULL DEFAULT 0,
      quota_limit     INT          NOT NULL DEFAULT 20,
      overage_enabled TINYINT(1)   NOT NULL DEFAULT 1,
      ai_engine       VARCHAR(50)  NOT NULL DEFAULT 'gemini',
      widget_config   JSON,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tryon_jobs (
      id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      shop                 VARCHAR(255) NOT NULL,
      product_id           VARCHAR(255),
      fashn_prediction_id  VARCHAR(255),
      status               VARCHAR(50)  NOT NULL DEFAULT 'pending',
      result_url           LONGTEXT,
      error                TEXT,
      counted              TINYINT(1)   NOT NULL DEFAULT 0,
      created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_shop_created (shop, created_at)
    )
  `);

  // Upgrade existing result_url column from TEXT → LONGTEXT if needed
  // (safe to run multiple times — MySQL ignores it if already LONGTEXT)
  await pool.execute(`
    ALTER TABLE tryon_jobs
    MODIFY COLUMN result_url LONGTEXT
  `).catch(() => {}); // ignore if table doesn't exist yet

  console.log("[database.js] Migrations applied ✓");
}

export { poolProxy as pool };
export default poolProxy;
