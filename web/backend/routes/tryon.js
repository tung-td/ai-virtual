import { Router } from "express";
import { upload, submit, getStatus } from "../controllers/tryOnController.js";

const router = Router();

// POST /api/tryon/submit — multipart upload + quota check + kick off AI generation
router.post("/submit", upload.single("person_photo"), submit);

// GET  /api/tryon/:jobId/status — poll job progress (live-polls fashn.ai if processing)
router.get("/:jobId/status", getStatus);

export default router;
