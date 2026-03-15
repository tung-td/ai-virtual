
import { asyncHandler, AppError } from "../middlewares/errorHandler.js";
import { getSession, getSessionShop } from "../middlewares/auth.js";
import {
  getPublicPlans,
  createSubscription,
} from "../services/billingService.js";
import Shop from "../models/Shop.js";

/**
 * GET /api/billing/plans
 * Return all available plans for display in the upgrade UI.
 */
export const getPlans = asyncHandler(async (_req, res) => {
  res.json({ success: true, plans: getPublicPlans() });
});

/**
 * GET /api/billing/status
 * Return the current shop's active plan and quota summary.
 */
export const getStatus = asyncHandler(async (_req, res) => {
  const shopDomain = getSessionShop(res);
  const shop = Shop.findByDomain(shopDomain);

  if (!shop) {
    throw new AppError("Shop not found", 404, "SHOP_NOT_FOUND");
  }

  res.json({
    success: true,
    billing: {
      plan: shop.plan,
      quota_used: shop.quota_used,
      quota_limit: shop.quota_limit,
      overage_enabled: shop.overage_enabled === 1,
    },
  });
});

/**
 * POST /api/billing/subscribe
 * Create a Shopify subscription charge for a given plan.
 *
 * Body: { plan: "starter" | "growth" | ... }
 *
 * Returns a confirmationUrl the frontend must redirect to for merchant approval.
 */
export const subscribe = asyncHandler(async (req, res) => {
  const session = getSession(res);
  const { plan } = req.body;

  if (!plan) {
    throw new AppError("plan is required", 400, "VALIDATION_ERROR");
  }

  const returnUrl = `${
    process.env.SHOPIFY_APP_URL ?? "https://example.com"
  }/api/billing/callback?plan=${plan}`;
  const { confirmationUrl, chargeId } = await createSubscription(
    session,
    plan,
    returnUrl,
  );

  if (!confirmationUrl) {
    // Free plan — no charge needed, just update the DB
    res.json({ success: true, message: "Switched to free plan." });
    return;
  }

  res.json({ success: true, confirmationUrl, chargeId });
});

/**
 * GET /api/billing/callback
 * Called by Shopify after merchant approves/declines the subscription.
 * Updates shop plan in DB after confirmation.
 */
export const callback = asyncHandler(async (req, res) => {
  const shopDomain = getSessionShop(res);
  const { plan, charge_id } = req.query;

  if (!plan) {
    throw new AppError("Missing plan in callback", 400, "VALIDATION_ERROR");
  }

  // TODO: In production, verify charge_id status via Shopify API before updating plan
  Shop.updatePlan(shopDomain, plan);

  // Redirect merchant back to app billing page
  res.redirect(`/billing?upgraded=${plan}`);
});
