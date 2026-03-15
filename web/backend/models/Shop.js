import db from "../config/database.js";
import { BILLING_PLANS } from "../config/shopify.js";

/**
 * Shop Model — manages the `shops` table.
 * One row per installed Shopify store.
 */
const Shop = {
  /**
   * Find a shop by its domain.
   * @param {string} shop - e.g. "mystore.myshopify.com"
   * @returns {object|null}
   */
  findByDomain(shop) {
    return db.prepare("SELECT * FROM shops WHERE shop = ?").get(shop);
  },

  /**
   * Create or update a shop record.
   * Called on OAuth callback (install/reinstall).
   * @param {object} data
   * @param {string} data.shop
   * @param {string} [data.plan]
   * @param {number} [data.quota_limit]
   * @param {number} [data.overage_enabled]
   * @param {string} [data.widget_config]
   */
  upsert({
    shop,
    plan = "free",
    quota_limit,
    overage_enabled = 1,
    widget_config = "{}",
  }) {
    const limit = quota_limit ?? BILLING_PLANS[plan]?.quotaLimit ?? 20;
    db.prepare(
      `
      INSERT INTO shops (shop, plan, quota_limit, overage_enabled, widget_config, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(shop) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run(shop, plan, limit, overage_enabled, widget_config);
    return Shop.findByDomain(shop);
  },

  /**
   * Update shop plan and reset quota limits.
   * @param {string} shop
   * @param {string} plan - key from BILLING_PLANS
   */
  updatePlan(shop, plan) {
    const planConfig = BILLING_PLANS[plan];
    if (!planConfig) throw new Error(`Unknown plan: ${plan}`);
    db.prepare(
      `
      UPDATE shops
      SET plan = ?, quota_limit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shop = ?
    `,
    ).run(plan, planConfig.quotaLimit, shop);
  },

  /**
   * Update widget config (colors, CTA text, etc.)
   * @param {string} shop
   * @param {object} config
   */
  updateWidgetConfig(shop, config) {
    db.prepare(
      `
      UPDATE shops
      SET widget_config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shop = ?
    `,
    ).run(JSON.stringify(config), shop);
  },

  /**
   * Update overage setting.
   * @param {string} shop
   * @param {boolean} enabled
   */
  setOverage(shop, enabled) {
    db.prepare(
      `
      UPDATE shops
      SET overage_enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shop = ?
    `,
    ).run(enabled ? 1 : 0, shop);
  },

  /**
   * Increment quota_used by 1. Called after each successful generation.
   * @param {string} shop
   */
  incrementQuota(shop) {
    db.prepare(
      `
      UPDATE shops
      SET quota_used = quota_used + 1, updated_at = CURRENT_TIMESTAMP
      WHERE shop = ?
    `,
    ).run(shop);
  },

  /**
   * Set AI Engine preference.
   * @param {string} shop
   * @param {string} engine - "premium" | "community" | "mock"
   */
  setAiEngine(shop, engine) {
    db.prepare(
      `
      UPDATE shops
      SET ai_engine = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shop = ?
    `,
    ).run(engine, shop);
  },

  /**
   * Reset monthly quota (called by a monthly cron job).
   * @param {string} shop
   */
  resetMonthlyQuota(shop) {
    db.prepare(
      `
      UPDATE shops
      SET quota_used = 0, updated_at = CURRENT_TIMESTAMP
      WHERE shop = ?
    `,
    ).run(shop);
  },
};

export default Shop;
