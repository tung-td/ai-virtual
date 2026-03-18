import pool from "../config/database.js";
import { BILLING_PLANS } from "../config/shopify.js";

/**
 * Shop Model — manages the `shops` table.
 * All methods are async (MySQL pool uses Promises).
 */
const Shop = {
  /**
   * Find a shop by its domain.
   * @param {string} shop
   * @returns {Promise<object|null>}
   */
  async findByDomain(shop) {
    const [rows] = await pool.execute(
      "SELECT * FROM shops WHERE shop = ? LIMIT 1",
      [shop],
    );
    return rows[0] ?? null;
  },

  /**
   * Create or update a shop record (called on OAuth install/reinstall).
   * @param {object} data
   */
  async upsert({ shop, plan = "free", quota_limit, overage_enabled = 1, widget_config = "{}" }) {
    const limit = quota_limit ?? BILLING_PLANS[plan]?.quotaLimit ?? 20;
    await pool.execute(
      `INSERT INTO shops (shop, plan, quota_limit, overage_enabled, widget_config)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE updated_at = NOW()`,
      [shop, plan, limit, overage_enabled, widget_config],
    );
    return Shop.findByDomain(shop);
  },

  /**
   * Update shop plan and reset quota limits.
   * @param {string} shop
   * @param {string} plan
   */
  async updatePlan(shop, plan) {
    const planConfig = BILLING_PLANS[plan];
    if (!planConfig) throw new Error(`Unknown plan: ${plan}`);
    await pool.execute(
      `UPDATE shops SET plan = ?, quota_limit = ? WHERE shop = ?`,
      [plan, planConfig.quotaLimit, shop],
    );
  },

  /**
   * Update widget config JSON.
   * @param {string} shop
   * @param {object} config
   */
  async updateWidgetConfig(shop, config) {
    await pool.execute(
      `UPDATE shops SET widget_config = ? WHERE shop = ?`,
      [JSON.stringify(config), shop],
    );
  },

  /**
   * Update overage setting.
   * @param {string} shop
   * @param {boolean} enabled
   */
  async setOverage(shop, enabled) {
    await pool.execute(
      `UPDATE shops SET overage_enabled = ? WHERE shop = ?`,
      [enabled ? 1 : 0, shop],
    );
  },

  /**
   * Increment quota_used by 1.
   * @param {string} shop
   */
  async incrementQuota(shop) {
    await pool.execute(
      `UPDATE shops SET quota_used = quota_used + 1 WHERE shop = ?`,
      [shop],
    );
  },

  /**
   * Reset monthly quota.
   * @param {string} shop
   */
  async resetMonthlyQuota(shop) {
    await pool.execute(
      `UPDATE shops SET quota_used = 0 WHERE shop = ?`,
      [shop],
    );
  },
};

export default Shop;
