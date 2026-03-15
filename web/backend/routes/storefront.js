import { Router } from "express";
import {
  upload,
  submitStorefront,
  getStatusStorefront,
} from "../controllers/tryOnController.js";

const router = Router();

// Allow all origins for storefront requests (public Storefront API)
router.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// POST /api/storefront/tryon/submit — multipart upload + offline session auth
router.post("/tryon/submit", upload.single("person_photo"), submitStorefront);

// GET  /api/storefront/tryon/:jobId/status
router.get("/tryon/:jobId/status", getStatusStorefront);

export default router;
