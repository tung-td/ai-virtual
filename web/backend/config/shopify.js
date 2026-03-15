
import { BillingInterval, LATEST_API_VERSION } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";
import { join } from "path";

const DB_PATH = join(process.cwd(), "database.sqlite");

/**
 * Shopify Billing Plans — synced with PRD F5.
 * Using Version 1 (Standard AI Model) pricing by default.
 * Switch to Version 2 pricing by changing the amounts.
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

const shopify = shopifyApp({
  api: {
    apiVersion: LATEST_API_VERSION,
    restResources,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true,
    },
    billing: undefined, // Billing handled manually via billingService.js
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  sessionStorage: new SQLiteSessionStorage(DB_PATH),
});

export default shopify;
