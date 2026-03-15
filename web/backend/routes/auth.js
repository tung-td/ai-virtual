
import { Router } from "express";
import {
  begin,
  callbackMiddlewares,
  processWebhooks,
} from "../controllers/authController.js";

const router = Router();

// OAuth flow — no session validation on these routes
router.get("/", begin);
router.get("/callback", ...callbackMiddlewares);

// GDPR webhooks — verified by Shopify SDK HMAC, NOT by session middleware
router.post("/webhooks", processWebhooks);

export default router;
