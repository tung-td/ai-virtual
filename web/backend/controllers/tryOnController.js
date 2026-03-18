import multer from "multer";
import TryOnJob from "../models/TryOnJob.js";
import Shop from "../models/Shop.js";
import { checkQuota } from "../services/billingService.js";
import { runGeminiTryOn } from "../services/geminiService.js";
import { asyncHandler, AppError } from "../middlewares/errorHandler.js";
import { getSessionShop, getSession } from "../middlewares/auth.js";
import { getGraphqlClient } from "../services/shopifyClient.js";
import shopify from "../config/shopify.js";

/** Accepted MIME types for person photo upload */
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** multer — memory storage, 20 MB limit */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ACCEPTED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          `Unsupported file type: ${file.mimetype}. Accepted: JPEG, PNG, WEBP, HEIC.`,
          400,
          "INVALID_FILE_TYPE",
        ),
      );
    }
  },
});

/**
 * Helper — fetch product data via Shopify GraphQL.
 */
async function getProductData(session, productId) {
  try {
    const client = getGraphqlClient(session);
    const res = await client.request(
      `query getProductData($id: ID!) {
        product(id: $id) {
          title
          tags
          featuredImage { url }
        }
      }`,
      { variables: { id: productId } },
    );
    const product = res.data?.product;
    return {
      imageUrl: product?.featuredImage?.url ?? null,
      title: product?.title ?? "",
      tags: product?.tags ?? [],
    };
  } catch {
    return { imageUrl: null, title: "", tags: [] };
  }
}

/**
 * POST /api/tryon/submit  (in-app / admin)
 */
export const submit = asyncHandler(async (req, res) => {
  const shopDomain = getSessionShop(res);
  const session = getSession(res);
  const { product_id } = req.body;

  if (!req.file) throw new AppError("person_photo is required.", 400, "MISSING_FILE");
  if (!product_id) throw new AppError("product_id is required.", 400, "MISSING_PRODUCT_ID");

  // Quota check
  const quota = await checkQuota(shopDomain);
  if (!quota.allowed) {
    throw new AppError(
      "Monthly generation quota exhausted. Upgrade your plan or enable overage.",
      402,
      "QUOTA_EXCEEDED",
    );
  }

  const personImageBase64 = req.file.buffer.toString("base64");
  const { imageUrl: garmentImageUrl } = await getProductData(session, product_id);

  // Get Gemini prompt from widget_config
  const shopConfig = await Shop.findByDomain(shopDomain);
  let geminiPrompt = null;
  try {
    const wc =
      typeof shopConfig?.widget_config === "object"
        ? shopConfig.widget_config
        : JSON.parse(shopConfig?.widget_config || "{}");
    geminiPrompt = wc.gemini_prompt || null;
  } catch { /* ignore */ }

  const { id: jobId } = await TryOnJob.create({ shop: shopDomain, product_id });

  // Run Gemini in background
  setImmediate(async () => {
    try {
      await TryOnJob.updateStatus(jobId, { status: "processing" });
      const result = await runGeminiTryOn(personImageBase64, garmentImageUrl, geminiPrompt);
      if (result.status === "completed") {
        await TryOnJob.updateStatus(jobId, { status: "done", result_url: result.output, counted: true });
        await Shop.incrementQuota(shopDomain);
      } else {
        throw new Error(result.error || "Gemini generation failed");
      }
    } catch (err) {
      console.error("[tryOnController] submit error:", err);
      await TryOnJob.updateStatus(jobId, { status: "failed", error: err.message });
    }
  });

  res.status(202).json({ success: true, jobId, estimatedSeconds: 20 });
});

/**
 * GET /api/tryon/:jobId/status  (in-app / admin)
 */
export const getStatus = asyncHandler(async (req, res) => {
  const shopDomain = getSessionShop(res);
  const { jobId } = req.params;

  const job = await TryOnJob.findById(Number(jobId));
  if (!job || job.shop !== shopDomain) throw new AppError("Job not found", 404, "JOB_NOT_FOUND");

  res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      result_url: job.result_url,
      error: job.error,
      created_at: job.created_at,
    },
  });
});

/**
 * POST /api/storefront/tryon/submit  (public storefront)
 */
export const submitStorefront = asyncHandler(async (req, res) => {
  const shopDomain = req.body.shop;
  if (!shopDomain) throw new AppError("Missing shop domain", 400);

  const sessions = await shopify.config.sessionStorage.findSessionsByShop(shopDomain);
  const session = sessions.find((s) => !s.isOnline) || sessions[0];
  if (!session) throw new AppError("Store not authenticated", 401);

  const { product_id } = req.body;
  if (!req.file) throw new AppError("person_photo is required.", 400, "MISSING_FILE");
  if (!product_id) throw new AppError("product_id is required.", 400, "MISSING_PRODUCT_ID");

  const quota = await checkQuota(shopDomain);
  if (!quota.allowed) throw new AppError("Monthly generation quota exhausted.", 402, "QUOTA_EXCEEDED");

  const personImageBase64 = req.file.buffer.toString("base64");
  const { imageUrl: garmentImageUrl } = await getProductData(session, product_id);

  const shopConfig = await Shop.findByDomain(shopDomain);
  let geminiPrompt = null;
  try {
    const wc =
      typeof shopConfig?.widget_config === "object"
        ? shopConfig.widget_config
        : JSON.parse(shopConfig?.widget_config || "{}");
    geminiPrompt = wc.gemini_prompt || null;
  } catch { /* ignore */ }

  const { id: jobId } = await TryOnJob.create({ shop: shopDomain, product_id });

  setImmediate(async () => {
    try {
      await TryOnJob.updateStatus(jobId, { status: "processing" });
      const result = await runGeminiTryOn(personImageBase64, garmentImageUrl, geminiPrompt);
      if (result.status === "completed") {
        await TryOnJob.updateStatus(jobId, { status: "done", result_url: result.output, counted: true });
        await Shop.incrementQuota(shopDomain);
      } else {
        throw new Error(result.error || "Gemini generation failed");
      }
    } catch (err) {
      console.error("[storefront] submit error:", err);
      await TryOnJob.updateStatus(jobId, { status: "failed", error: err.message });
    }
  });

  res.status(202).json({ success: true, jobId, estimatedSeconds: 20 });
});

/**
 * GET /api/storefront/tryon/:jobId/status  (public storefront polling)
 */
export const getStatusStorefront = asyncHandler(async (req, res) => {
  const shopDomain = req.query.shop;
  if (!shopDomain) throw new AppError("Missing shop domain", 400);

  const { jobId } = req.params;
  const job = await TryOnJob.findById(Number(jobId));

  if (!job) throw new AppError("Job not found", 404);
  if (job.shop !== shopDomain) throw new AppError("Forbidden", 403);

  res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      result_url: job.result_url,
      error: job.error,
      created_at: job.created_at,
    },
  });
});
