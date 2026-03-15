
import Shop from "../models/Shop.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { getSessionShop } from "../middlewares/auth.js";
import PrivacyWebhookHandlers from "../../privacy.js";
import shopify from "../config/shopify.js";

/**
 * authController — Shopify OAuth flow.
 *
 * The heavy lifting (HMAC validation, session token exchange) is handled by
 * the @shopify/shopify-app-express SDK. We just wire up DB upsert after callback.
 */

/**
 * GET /api/auth
 * Begin OAuth (redirect to Shopify consent screen).
 * Directly delegates to Shopify SDK middleware.
 */
export const begin = shopify.auth.begin();

/**
 * GET /api/auth/callback
 * OAuth callback — Shopify SDK validates the token, then we upsert the shop.
 */
export const callbackMiddlewares = [
  shopify.auth.callback(),
  asyncHandler(async (_req, res, next) => {
    const shopDomain = getSessionShop(res);
    // Upsert shop on every install/reinstall — resets nothing, just ensures the row exists
    Shop.upsert({ shop: shopDomain });
    next();
  }),
  shopify.redirectToShopifyOrAppRoot(),
];

/**
 * POST /api/webhooks
 * Process GDPR / privacy webhooks required by Shopify App Store.
 */
export const processWebhooks = shopify.processWebhooks({
  webhookHandlers: PrivacyWebhookHandlers,
});
