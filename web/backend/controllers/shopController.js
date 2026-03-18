import Shop from "../models/Shop.js";
import { BILLING_PLANS } from "../config/shopify.js";
import { asyncHandler, AppError } from "../middlewares/errorHandler.js";
import { getSessionShop } from "../middlewares/auth.js";

/**
 * GET /api/shop/settings
 * Returns the shop's current settings: plan, quota, widget config.
 */
export const getSettings = asyncHandler(async (_req, res) => {
  const shopDomain = getSessionShop(res);

  let shop = await Shop.findByDomain(shopDomain);
  if (!shop) {
    // Try to create, may still return null in mock-DB mode
    shop = await Shop.upsert({ shop: shopDomain });
  }

  // Fallback defaults when running without a real database (mock mode)
  const plan       = shop?.plan ?? "free";
  const planConfig = BILLING_PLANS[plan] ?? BILLING_PLANS.free;
  let widgetConfig = {};
  try {
    widgetConfig =
      typeof shop?.widget_config === "object"
        ? (shop.widget_config ?? {})
        : JSON.parse(shop?.widget_config || "{}");
  } catch {
    widgetConfig = {};
  }

  res.json({
    success: true,
    settings: {
      shop: shopDomain,
      plan,
      quota: {
        used:             shop?.quota_used  ?? 0,
        limit:            shop?.quota_limit ?? planConfig.quotaLimit,
        remaining:        Math.max(0, (shop?.quota_limit ?? planConfig.quotaLimit) - (shop?.quota_used ?? 0)),
        overage_enabled:  (shop?.overage_enabled ?? 1) === 1,
        overage_price:    planConfig.overagePrice,
      },
      ai_engine:    "gemini",
      widget_config: widgetConfig,
      widget:        widgetConfig,
      gemini_prompt: widgetConfig.gemini_prompt ?? "",
    },
  });
});

/**
 * PUT /api/shop/settings
 * Update widget config and/or overage setting.
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const shopDomain = getSessionShop(res);
  const widget = req.body.widget ?? req.body.widget_config;
  const overage = req.body.overage ?? req.body.overage_enabled;

  if (widget !== undefined) {
    if (typeof widget !== "object" || Array.isArray(widget)) {
      throw new AppError("widget must be a plain object", 400, "VALIDATION_ERROR");
    }
    await Shop.updateWidgetConfig(shopDomain, widget);
  }

  if (overage !== undefined) {
    await Shop.setOverage(shopDomain, Boolean(overage));
  }

  // If gemini_prompt is sent separately, merge it into widget_config
  if (req.body.gemini_prompt !== undefined) {
    const existingShop = await Shop.findByDomain(shopDomain);
    let existingWidget = {};
    try {
      existingWidget =
        typeof existingShop?.widget_config === "object"
          ? existingShop.widget_config
          : JSON.parse(existingShop?.widget_config || "{}");
    } catch { /* ignore */ }
    existingWidget.gemini_prompt = req.body.gemini_prompt || "";
    await Shop.updateWidgetConfig(shopDomain, existingWidget);
  }

  res.json({ success: true, message: "Settings updated." });
});
