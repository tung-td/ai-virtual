import pool from "../config/database.js";

/**
 * TryOnJob Model — manages the `tryon_jobs` table.
 * All methods are async (MySQL pool uses Promises).
 */
const TryOnJob = {
  /**
   * Create a new job record in 'pending' state.
   * @param {object} data
   * @returns {Promise<{ id: number }>}
   */
  async create({ shop, product_id = null, fashn_prediction_id = null }) {
    const [result] = await pool.execute(
      `INSERT INTO tryon_jobs (shop, product_id, fashn_prediction_id, status)
       VALUES (?, ?, ?, 'pending')`,
      [shop, product_id, fashn_prediction_id],
    );
    return { id: result.insertId };
  },

  /**
   * Find a job by id.
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const [rows] = await pool.execute(
      "SELECT * FROM tryon_jobs WHERE id = ? LIMIT 1",
      [id],
    );
    return rows[0] ?? null;
  },

  /**
   * Update the status (and optionally result_url or error) of a job.
   * @param {number} id
   * @param {object} updates
   */
  async updateStatus(id, { status, result_url = null, error = null, counted = false }) {
    await pool.execute(
      `UPDATE tryon_jobs
       SET status = ?, result_url = ?, error = ?, counted = ?
       WHERE id = ?`,
      [status, result_url, error, counted ? 1 : 0, id],
    );
  },

  /**
   * Store a prediction ID (for polling later).
   * @param {number} id
   * @param {string} predictionId
   */
  async setPredictionId(id, predictionId) {
    await pool.execute(
      `UPDATE tryon_jobs SET fashn_prediction_id = ? WHERE id = ?`,
      [predictionId, id],
    );
  },

  /**
   * Count jobs counted against quota in the current calendar month.
   * @param {string} shop
   * @returns {Promise<number>}
   */
  async countByShopThisMonth(shop) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tryon_jobs
       WHERE shop = ? AND counted = 1
         AND YEAR(created_at) = YEAR(NOW())
         AND MONTH(created_at) = MONTH(NOW())`,
      [shop],
    );
    return rows[0]?.total ?? 0;
  },

  /**
   * List recent jobs for a shop.
   * @param {string} shop
   * @param {number} [limit]
   * @returns {Promise<object[]>}
   */
  async listByShop(shop, limit = 50) {
    const [rows] = await pool.execute(
      `SELECT * FROM tryon_jobs WHERE shop = ?
       ORDER BY created_at DESC LIMIT ?`,
      [shop, limit],
    );
    return rows;
  },
};

export default TryOnJob;
