import { BillingInterval, LATEST_API_VERSION } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { MySQLSessionStorage } from "@shopify/shopify-app-session-storage-mysql";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";

/**
 * Shopify Billing Plans — synced with PRD F5.
 */
export const BILLING_PLANS = {
  free: {
    name: "Free",
    amount: 0,
    quotaLimit: 20,
    overagePrice: 0.12,
  },
  starter: {
    name: "Starter",
    amount: 19,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    quotaLimit: 300,
    overagePrice: 0.1,
  },
  growth: {
    name: "Growth",
    amount: 59,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    quotaLimit: 1200,
    overagePrice: 0.075,
  },
  scale: {
    name: "Scale",
    amount: 149,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    quotaLimit: 3500,
    overagePrice: 0.055,
  },
  pro: {
    name: "Pro",
    amount: 349,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    quotaLimit: 12000,
    overagePrice: 0.038,
  },
  enterprise: {
    name: "Enterprise",
    amount: 1299,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    quotaLimit: 56000,
    overagePrice: 0.028,
  },
};

// Read DATABASE_URL here (not at import time) so dotenv.config() has run first.
// shopify.js is imported by index.js after dotenv.config() has been called.
// However due to ESM hoisting this still runs early — we guard with a Proxy fallback.
const _dbUrl = process.env.DATABASE_URL;
const _isValidDbUrl = !!_dbUrl && !_dbUrl.includes("user:password") && !_dbUrl.includes("user:pass@host");

// In-memory session shim for mock / no-DB mode
const _inMemorySessions = new Map();
const _memoryStorage = {
  storeSession:      async (s) => { _inMemorySessions.set(s.id, s); return true; },
  loadSession:       async (id) => _inMemorySessions.get(id) ?? undefined,
  deleteSession:     async (id) => { _inMemorySessions.delete(id); return true; },
  deleteSessions:    async (ids) => { ids.forEach((id) => _inMemorySessions.delete(id)); return true; },
  findSessionsByShop: async (shop) => [..._inMemorySessions.values()].filter((s) => s.shop === shop),
};

const sessionStorage = _isValidDbUrl
  ? new MySQLSessionStorage(_dbUrl)
  : _memoryStorage;


const shopify = shopifyApp({
  api: {
    apiVersion: LATEST_API_VERSION,
    restResources,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true,
    },
    billing: undefined,
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  sessionStorage,
});

export default shopify;
