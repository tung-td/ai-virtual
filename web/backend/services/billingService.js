
import { BILLING_PLANS } from "../config/shopify.js";
import Shop from "../models/Shop.js";
import { AppError } from "../middlewares/errorHandler.js";

/**
 * billingService — handles plan logic, quota enforcement, and Shopify Billing API.
 */

/**
 * Return an array of public plan descriptors (safe to send to frontend).
 * @returns {object[]}
 */
export function getPublicPlans() {
  return Object.entries(BILLING_PLANS).map(([key, plan]) => ({
    key,
    name: plan.name,
    amount: plan.amount,
    currencyCode: plan.currencyCode ?? "USD",
    quotaLimit: plan.quotaLimit,
    overagePrice: plan.overagePrice,
  }));
}

/**
 * Check if a shop has available quota.
 * Returns { allowed, remaining, overageActive }
 *
 * @param {string} shopDomain
 * @returns {{ allowed: boolean, remaining: number, overageActive: boolean }}
 */
export function checkQuota(shopDomain) {
  const shop = Shop.findByDomain(shopDomain);
  if (!shop) throw new AppError("Shop not found", 404, "SHOP_NOT_FOUND");

  const remaining = shop.quota_limit - shop.quota_used;
  const overageActive = shop.overage_enabled === 1;

  if (remaining > 0) {
    return { allowed: true, remaining, overageActive };
  }

  if (overageActive) {
    // Overage is on: allow the generation, charge will be tracked separately
    return { allowed: true, remaining: 0, overageActive: true };
  }

  return { allowed: false, remaining: 0, overageActive: false };
}

/**
 * Create a Shopify recurring application charge (subscription).
 * NOTE: The charge is not active until the merchant approves the confirmation URL.
 *
 * @param {import("@shopify/shopify-api").Session} session
 * @param {string} planKey - key from BILLING_PLANS
 * @param {string} returnUrl - where Shopify redirects after merchant confirms
 * @returns {Promise<{ confirmationUrl: string, chargeId: string }>}
 */
export async function createSubscription(session, planKey, returnUrl) {
  const plan = BILLING_PLANS[planKey];
  if (!plan || plan.amount === 0) {
    // Free plan: no charge needed
    Shop.updatePlan(session.shop, planKey);
    return { confirmationUrl: null, chargeId: null };
  }

  // Dynamically import shopify to avoid circular dependency
  const { default: shopify } = await import("../config/shopify.js");

  const response = await shopify.api.clients.Graphql({ session }).request(
    `
    mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `,
    {
      variables: {
        name: plan.name,
        returnUrl,
        test: process.env.NODE_ENV !== "production",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: plan.amount, currencyCode: plan.currencyCode },
                interval: plan.interval,
              },
            },
          },
        ],
      },
    },
  );

  const { confirmationUrl, appSubscription, userErrors } =
    response.data.appSubscriptionCreate;

  if (userErrors?.length > 0) {
    throw new AppError(userErrors[0].message, 400, "BILLING_ERROR");
  }

  return {
    confirmationUrl,
    chargeId: appSubscription.id,
  };
}
