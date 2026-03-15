
import { Router } from "express";
import { getSettings, updateSettings } from "../controllers/shopController.js";

const router = Router();

// GET /api/shop/settings  — return plan, quota, widget config
router.get("/settings", getSettings);

// PUT /api/shop/settings  — update widget config and/or overage toggle
router.put("/settings", updateSettings);

export default router;
