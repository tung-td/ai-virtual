
import shopify from "../config/shopify.js";

/**
 * requireAuth
 * Middleware: Validates the Shopify authenticated session for /api/* routes.
 * If the session is missing or expired, Shopify SDK will respond with 401/403.
 *
 * Usage: router.use(requireAuth)
 */
export const requireAuth = shopify.validateAuthenticatedSession();

/**
 * requireInstalled
 * Middleware: Ensures the app is installed on the shop before serving the SPA.
 * Redirects to OAuth if not installed.
 *
 * Usage: app.use("/*", requireInstalled, serveHtml)
 */
export const requireInstalled = shopify.ensureInstalledOnShop();

/**
 * getSessionShop
 * Helper: Extract the shop domain from the current authenticated session.
 * @param {import("express").Response} res
 * @returns {string}
 */
export function getSessionShop(res) {
  return res.locals.shopify.session.shop;
}

/**
 * getSession
 * Helper: Get the full Shopify session object.
 * @param {import("express").Response} res
 * @returns {import("@shopify/shopify-api").Session}
 */
export function getSession(res) {
  return res.locals.shopify.session;
}
