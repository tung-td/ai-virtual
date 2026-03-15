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

  let shop = Shop.findByDomain(shopDomain);
  if (!shop) {
    // Auto-create on first access (edge case after OAuth)
    shop = Shop.upsert({ shop: shopDomain });
  }

  const planConfig = BILLING_PLANS[shop.plan] ?? BILLING_PLANS.free;
  let widgetConfig = {};
  try {
    widgetConfig = JSON.parse(shop.widget_config);
  } catch {
    widgetConfig = {};
  }

  res.json({
    success: true,
    settings: {
      shop: shopDomain,
      plan: shop.plan,
      quota: {
        used: shop.quota_used,
        limit: shop.quota_limit,
        remaining: Math.max(0, shop.quota_limit - shop.quota_used),
        overage_enabled: shop.overage_enabled === 1,
        overage_price: planConfig.overagePrice,
      },
      ai_engine: shop.ai_engine,
      widget: widgetConfig,
    },
  });
});

/**
 * PUT /api/shop/settings
 * Update widget config and/or overage setting.
 *
 * Body:
 *   widget  {object}  — widget appearance config (button color, text, etc.)
 *   overage {boolean} — enable/disable overage billing
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const shopDomain = getSessionShop(res);
  // Accept both key variants for forward/backward compatibility
  const widget = req.body.widget ?? req.body.widget_config;
  const overage = req.body.overage ?? req.body.overage_enabled;

  if (widget !== undefined) {
    if (typeof widget !== "object" || Array.isArray(widget)) {
      throw new AppError(
        "widget must be a plain object",
        400,
        "VALIDATION_ERROR",
      );
    }
    Shop.updateWidgetConfig(shopDomain, widget);
  }

  if (overage !== undefined) {
    Shop.setOverage(shopDomain, Boolean(overage));
  }

  if (req.body.ai_engine) {
    const validEngines = ["premium", "community", "mock"];
    if (validEngines.includes(req.body.ai_engine)) {
      Shop.setAiEngine(shopDomain, req.body.ai_engine);
    }
  }

  res.json({ success: true, message: "Settings updated." });
});
