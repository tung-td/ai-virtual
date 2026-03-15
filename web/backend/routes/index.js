import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";

import authRoutes from "./auth.js";
import productRoutes from "./products.js";
import shopRoutes from "./shop.js";
import billingRoutes from "./billing.js";
import tryonRoutes from "./tryon.js";
import storefrontRoutes from "./storefront.js";

const router = Router();

// ── Public Storefront routes (CORS enabled, offline session auth) ────────────
router.use("/storefront", storefrontRoutes);

// ── Public auth routes (no session required) ─────────────────────────────────
// Mounted at /api/auth/* and /api/webhooks in index.js directly via authController,
// so nothing to add here.

// ── Protected API routes ─────────────────────────────────────────────────────
// All routes below require a valid Shopify session.
router.use(requireAuth);

router.use("/products", productRoutes);
router.use("/shop", shopRoutes);
router.use("/billing", billingRoutes);
router.use("/tryon", tryonRoutes);

export default router;
