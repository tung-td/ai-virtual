
import { Router } from "express";
import {
  getPlans,
  getStatus,
  subscribe,
  callback,
} from "../controllers/billingController.js";

const router = Router();

// GET  /api/billing/plans      — list all available plans
router.get("/plans", getPlans);

// GET  /api/billing/status     — current shop plan + quota
router.get("/status", getStatus);

// POST /api/billing/subscribe  — create Shopify charge for a plan
router.post("/subscribe", subscribe);

// GET  /api/billing/callback   — Shopify redirects here after merchant approval
router.get("/callback", callback);

export default router;
