import db from "../config/database.js";

/**
 * TryOnJob Model — manages the `tryon_jobs` table.
 * Audit log and status tracker for every try-on generation request.
 */
const TryOnJob = {
  /**
   * Create a new job record in 'pending' state.
   * @param {object} data
   * @param {string} data.shop
   * @param {string} [data.product_id]
   * @returns {{ id: number }} the inserted row with its id
   */
  create({ shop, product_id = null, fashn_prediction_id = null }) {
    const result = db
      .prepare(
        `
      INSERT INTO tryon_jobs (shop, product_id, fashn_prediction_id, status)
      VALUES (?, ?, ?, 'pending')
    `,
      )
      .run(shop, product_id, fashn_prediction_id);
    return { id: result.lastInsertRowid };
  },

  /**
   * Find a job by id.
   * @param {number} id
   * @returns {object|null}
   */
  findById(id) {
    return db.prepare("SELECT * FROM tryon_jobs WHERE id = ?").get(id);
  },

  /**
   * Update the status (and optionally result_url or error) of a job.
   * @param {number} id
   * @param {object} updates
   * @param {string} updates.status - 'pending'|'processing'|'done'|'failed'
   * @param {string} [updates.result_url]
   * @param {string} [updates.error]
   * @param {boolean} [updates.counted] - mark as quota-counted
   */
  updateStatus(
    id,
    { status, result_url = null, error = null, counted = false },
  ) {
    db.prepare(
      `
      UPDATE tryon_jobs
      SET status = ?, result_url = ?, error = ?, counted = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(status, result_url, error, counted ? 1 : 0, id);
  },

  /**
   * Store the fashn.ai prediction ID once known (after submit).
   * @param {number} id
   * @param {string} predictionId
   */
  setPredictionId(id, predictionId) {
    db.prepare(
      `UPDATE tryon_jobs SET fashn_prediction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(predictionId, id);
  },

  /**
   * Count how many jobs have been counted against quota this calendar month.
   * @param {string} shop
   * @returns {number}
   */
  countByShopThisMonth(shop) {
    const row = db
      .prepare(
        `
      SELECT COUNT(*) as total
      FROM tryon_jobs
      WHERE shop = ?
        AND counted = 1
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `,
      )
      .get(shop);
    return row?.total ?? 0;
  },

  /**
   * List recent jobs for a shop (for admin audit view).
   * @param {string} shop
   * @param {number} [limit]
   * @returns {object[]}
   */
  listByShop(shop, limit = 50) {
    return db
      .prepare(
        `
      SELECT * FROM tryon_jobs
      WHERE shop = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
      )
      .all(shop, limit);
  },
};

export default TryOnJob;
