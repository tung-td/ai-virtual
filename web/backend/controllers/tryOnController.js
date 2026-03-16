import multer from "multer";
import TryOnJob from "../models/TryOnJob.js";
import Shop from "../models/Shop.js";
import { checkQuota } from "../services/billingService.js";
import { submitTryOn, pollTryOnResult } from "../services/tryOnService.js";
import {
  submitFreeTryOn,
  runOOTDiffusion,
} from "../services/ootDiffusionService.js";
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
 * Helper — fetch product data (image URL, title, tags) via Shopify GraphQL.
 * Returns { imageUrl, title, tags } — all fields may be null/empty on failure.
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
 * POST /api/tryon/submit
 * Accepts multipart/form-data with:
 *   - person_photo  (File)
 *   - product_id    (string — Shopify GID)
 *   - category      (optional: "tops"|"bottoms"|"one-pieces"|"auto")
 */
export const submit = asyncHandler(async (req, res) => {
  const shopDomain = getSessionShop(res);
  const session = getSession(res);

  const { product_id, category = "auto" } = req.body;

  if (!req.file) {
    throw new AppError("person_photo is required.", 400, "MISSING_FILE");
  }
  if (!product_id) {
    throw new AppError("product_id is required.", 400, "MISSING_PRODUCT_ID");
  }

  // 1. Quota check
  const quota = checkQuota(shopDomain);
  if (!quota.allowed) {
    throw new AppError(
      "Monthly generation quota exhausted. Upgrade your plan or enable overage.",
      402,
      "QUOTA_EXCEEDED",
    );
  }

  // 2. Encode person photo to base64
  const personImageBase64 = req.file.buffer.toString("base64");

  // 3. Resolve product data (image URL + title + tags) from Shopify
  const { imageUrl: garmentImageUrl, title: productTitle, tags: productTags } =
    await getProductData(session, product_id);

  // 4. Fetch shop config (AI Engine)
  const shopConfig = Shop.findByDomain(shopDomain);
  const engine = shopConfig?.ai_engine || "premium";

  // 5. Create job record
  const { id: jobId } = TryOnJob.create({
    shop: shopDomain,
    product_id,
    fashn_prediction_id: null,
  });

  // 6. Submit based on engine
  setImmediate(async () => {
    try {
      TryOnJob.updateStatus(jobId, { status: "processing" });

      if (engine === "community") {
        // Option 1: Community (Free - Hugging Face IDM-VTON)
        const { predictionId } = await submitFreeTryOn(
          personImageBase64,
          garmentImageUrl,
          category,
        );
        TryOnJob.setPredictionId(jobId, predictionId);

        // Run the blocking Gradio call in background
        // Pass productTitle + productTags so IDM-VTON can build a rich prompt
        const result = await runOOTDiffusion(
          personImageBase64,
          garmentImageUrl,
          category,
          productTitle,
          productTags,
        );
        if (result.status === "completed") {
          TryOnJob.updateStatus(jobId, {
            status: "done",
            result_url: result.output,
            counted: true,
          });
          Shop.incrementQuota(shopDomain);
        } else {
          throw new Error(result.error || "IDM-VTON failed");
        }
      } else {
        // Option 2: Premium (Paid - fashn.ai) or Mock
        const { predictionId } = await submitTryOn(
          personImageBase64,
          garmentImageUrl,
          category,
        );
        TryOnJob.setPredictionId(jobId, predictionId);
      }
    } catch (err) {
      console.error("[tryOnController] submit error:", err);
      TryOnJob.updateStatus(jobId, {
        status: "failed",
        error: err.message,
        counted: false,
      });
    }
  });

  res
    .status(202)
    .json({
      success: true,
      jobId,
      estimatedSeconds: engine === "community" ? 60 : 15,
    });
});

/**
 * GET /api/tryon/:jobId/status
 * Polls fashn.ai if job is still processing; updates DB when done.
 */
export const getStatus = asyncHandler(async (req, res) => {
  const shopDomain = getSessionShop(res);
  const { jobId } = req.params;

  const job = TryOnJob.findById(Number(jobId));
  if (!job || job.shop !== shopDomain) {
    throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
  }

  // If still processing and we have a prediction ID, poll fashn.ai
  if (job.status === "processing" && job.fashn_prediction_id) {
    try {
      const result = await pollTryOnResult(job.fashn_prediction_id);

      if (result.status === "completed") {
        TryOnJob.updateStatus(job.id, {
          status: "done",
          result_url: result.output,
          counted: true,
        });
        Shop.incrementQuota(shopDomain);

        return res.json({
          success: true,
          job: {
            id: job.id,
            status: "done",
            result_url: result.output,
            error: null,
            created_at: job.created_at,
          },
        });
      }

      if (result.status === "failed") {
        TryOnJob.updateStatus(job.id, {
          status: "failed",
          error: result.error ?? "fashn.ai generation failed",
          counted: false,
        });
        return res.json({
          success: true,
          job: {
            id: job.id,
            status: "failed",
            result_url: null,
            error: result.error,
            created_at: job.created_at,
          },
        });
      }

      // still starting/in_queue/processing — return current DB state
    } catch (err) {
      console.error("[tryOnController] poll error:", err);
    }
  }

  // Re-read fresh job state
  const fresh = TryOnJob.findById(Number(jobId));
  res.json({
    success: true,
    job: {
      id: fresh.id,
      status: fresh.status,
      result_url: fresh.result_url,
      error: fresh.error,
      created_at: fresh.created_at,
    },
  });
});

/**
 * POST /api/storefront/tryon/submit
 * Public storefront endpoint (CORS enabled). Requires `shop` in body.
 */
export const submitStorefront = asyncHandler(async (req, res) => {
  const shopDomain = req.body.shop;
  if (!shopDomain) throw new AppError("Missing shop domain", 400);

  // Retrieve offline session for this shop
  const sessions = await shopify.config.sessionStorage.findSessionsByShop(
    shopDomain,
  );
  const session = sessions.find((s) => !s.isOnline) || sessions[0];
  if (!session) throw new AppError("Store not authenticated", 401);

  const { product_id, category = "auto" } = req.body;

  if (!req.file)
    throw new AppError("person_photo is required.", 400, "MISSING_FILE");
  if (!product_id)
    throw new AppError("product_id is required.", 400, "MISSING_PRODUCT_ID");

  const quota = checkQuota(shopDomain);
  if (!quota.allowed) {
    throw new AppError(
      "Monthly generation quota exhausted.",
      402,
      "QUOTA_EXCEEDED",
    );
  }

  const personImageBase64 = req.file.buffer.toString("base64");
  const { imageUrl: garmentImageUrl, title: productTitle, tags: productTags } =
    await getProductData(session, product_id);

  const shopConfig = Shop.findByDomain(shopDomain);
  const engine = shopConfig?.ai_engine || "premium";

  const { id: jobId } = TryOnJob.create({
    shop: shopDomain,
    product_id,
    fashn_prediction_id: null,
  });

  setImmediate(async () => {
    try {
      TryOnJob.updateStatus(jobId, { status: "processing" });

      if (engine === "community") {
        const { predictionId } = await submitFreeTryOn(
          personImageBase64,
          garmentImageUrl,
          category,
        );
        TryOnJob.setPredictionId(jobId, predictionId);

        const result = await runOOTDiffusion(
          personImageBase64,
          garmentImageUrl,
          category,
          productTitle,
          productTags,
        );
        if (result.status === "completed") {
          TryOnJob.updateStatus(jobId, {
            status: "done",
            result_url: result.output,
            counted: true,
          });
          Shop.incrementQuota(shopDomain);
        } else {
          throw new Error(result.error || "IDM-VTON failed");
        }
      } else {
        const { predictionId } = await submitTryOn(
          personImageBase64,
          garmentImageUrl,
          category,
        );
        TryOnJob.setPredictionId(jobId, predictionId);
      }
    } catch (err) {
      console.error("[storefront] submit error:", err);
      TryOnJob.updateStatus(jobId, {
        status: "failed",
        error: err.message,
      });
    }
  });

  res
    .status(202)
    .json({
      success: true,
      jobId,
      estimatedSeconds: engine === "community" ? 60 : 15,
    });
});

/**
 * GET /api/storefront/tryon/:jobId/status
 * Public storefront polling endpoint. Requires `shop` in query.
 */
export const getStatusStorefront = asyncHandler(async (req, res) => {
  const shopDomain = req.query.shop;
  if (!shopDomain) throw new AppError("Missing shop domain", 400);

  const { jobId } = req.params;
  const job = TryOnJob.findById(Number(jobId));

  if (!job) throw new AppError("Job not found", 404);
  if (job.shop !== shopDomain) throw new AppError("Forbidden", 403);

  if (["starting", "in_queue", "processing"].includes(job.status)) {
    try {
      if (job.fashn_prediction_id) {
        const result = await pollTryOnResult(job.fashn_prediction_id);
        if (result.status === "completed" && result.output) {
          TryOnJob.updateStatus(job.id, {
            status: "done",
            result_url: result.output,
            counted: true,
          });
          Shop.incrementQuota(shopDomain);

          return res.json({
            success: true,
            job: {
              id: job.id,
              status: "done",
              result_url: result.output,
              error: null,
              created_at: job.created_at,
            },
          });
        }
        if (result.status === "failed") {
          TryOnJob.updateStatus(job.id, {
            status: "failed",
            error: result.error ?? "Generation failed",
            counted: false,
          });
          return res.json({
            success: true,
            job: {
              id: job.id,
              status: "failed",
              result_url: null,
              error: result.error,
              created_at: job.created_at,
            },
          });
        }
      }
    } catch (err) {
      console.error("[storefront] poll error:", err);
    }
  }

  const fresh = TryOnJob.findById(Number(jobId));
  res.json({
    success: true,
    job: {
      id: fresh.id,
      status: fresh.status,
      result_url: fresh.result_url,
      error: fresh.error,
      created_at: fresh.created_at,
    },
  });
});
