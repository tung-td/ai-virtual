import { client } from "@gradio/client";

/**
 * ootDiffusionService.js — Free AI Try-On via Hugging Face Spaces.
 * Uses yisol/IDM-VTON (the official IDM-VTON Space, built on SDXL).
 *
 * Key improvements over the old OOTDiffusion (SD 1.5):
 *  - Text prompts for garment + person description guide the diffusion
 *  - SDXL base → better color accuracy, fabric realism, fine details
 *  - Works with "in-the-wild" photos (complex backgrounds, diverse poses)
 *
 * Note: yisol/IDM-VTON runs on HuggingFace ZeroGPU (free, shared GPU).
 * Expect queue wait times of 60–180s depending on server load.
 * The Space URL: https://huggingface.co/spaces/yisol/IDM-VTON
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Primary Space: yisol/IDM-VTON — official IDM-VTON, Running on ZeroGPU ✅
 * Endpoint api_name: "tryon" → /tryon
 */
const HF_SPACE = "yisol/IDM-VTON";

/** Default person context when we have no extra info. */
const DEFAULT_PERSON_PROMPT =
  "a person standing, front view, full body, neutral pose, clear lighting";

/** Denoise steps — balance between quality and speed.
 *  20: fast (~60s), 30: balanced (~90s), 40: best quality (~120s)
 *  You can expose this as a merchant setting later. */
const DENOISE_STEPS = 30;

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Build a garment text prompt from product metadata.
 * IDM-VTON uses this to guide garment feature encoding via cross-attention.
 *
 * @param {string} productTitle  - e.g. "Classic Blue Denim Jacket"
 * @param {string} category      - "tops" | "bottoms" | "one-pieces" | "auto"
 * @param {string[]} [tags]      - Shopify product tags, e.g. ["cotton","slim-fit"]
 * @returns {string}
 */
export function buildGarmentPrompt(productTitle = "", category = "auto", tags = []) {
  const catLabel = mapCategoryToLabel(category);

  // Extract useful signal from tags (colour, material, fit keywords)
  const materialKeywords = ["cotton", "linen", "silk", "polyester", "denim",
    "wool", "leather", "satin", "velvet", "knit", "jersey"];
  const fitKeywords = ["slim", "regular", "loose", "oversized", "fitted",
    "relaxed", "cropped", "maxi", "mini", "midi"];

  const tagStr = tags.join(" ").toLowerCase();
  const materials = materialKeywords.filter((k) => tagStr.includes(k));
  const fits = fitKeywords.filter((k) => tagStr.includes(k));

  // Build prompt string
  const parts = [];
  if (productTitle) parts.push(productTitle.trim());
  if (catLabel) parts.push(catLabel);
  if (materials.length) parts.push(materials.join(", "));
  if (fits.length) parts.push(fits.join(", ") + " fit");
  parts.push("product photo, flat lay, white background");

  return parts.join(", ");
}

/**
 * Map our internal category names → human-readable label for the prompt.
 * @param {string} category
 * @returns {string}
 */
function mapCategoryToLabel(category = "auto") {
  const c = category.toLowerCase();
  if (c.includes("bottom")) return "lower body clothing, pants or skirt";
  if (c.includes("top") || c.includes("shirt") || c.includes("jacket"))
    return "upper body clothing, top or jacket";
  if (c.includes("dress") || c.includes("one-piece"))
    return "full body dress or one-piece outfit";
  return "clothing garment"; // auto / unknown
}

/**
 * Map category to IDM-VTON's expected category string.
 * @param {string} category
 * @returns {"upper_body"|"lower_body"|"dresses"}
 */
function mapCategoryToIDMVTON(category = "auto") {
  const c = category.toLowerCase();
  if (c.includes("bottom")) return "lower_body";
  if (c.includes("dress") || c.includes("one-piece")) return "dresses";
  return "upper_body"; // tops / auto default
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a try-on job — returns a fake predictionId immediately
 * so the controller can respond to the frontend quickly.
 * The actual work is done in runIDMVTON().
 *
 * @param {string} personImageBase64
 * @param {string} garmentImageUrl
 * @param {string} category
 * @returns {Promise<{ predictionId: string }>}
 */
export async function submitFreeTryOn(
  personImageBase64,
  garmentImageUrl,
  category = "auto",
) {
  return {
    predictionId: `idmvton_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  };
}

/**
 * Perform the actual IDM-VTON Gradio call.
 * Call this AFTER submitFreeTryOn() in the background.
 *
 * @param {string} personImageBase64   - base64 encoded person photo
 * @param {string} garmentImageUrl     - public URL of the garment image
 * @param {string} category            - "tops" | "bottoms" | "one-pieces" | "auto"
 * @param {string} [productTitle]      - Shopify product title for garment prompt
 * @param {string[]} [productTags]     - Shopify product tags for richer prompt
 * @param {string} [garmentPrompt]     - Override: custom garment description
 * @param {string} [personPrompt]      - Override: custom person description
 * @returns {Promise<{ status: "completed"|"failed", output?: string, error?: string }>}
 */
export async function runOOTDiffusion(
  personImageBase64,
  garmentImageUrl,
  category,
  productTitle = "",
  productTags = [],
  garmentPrompt = null,
  personPrompt = null,
) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 15_000; // 15s between retries — ZeroGPU usually frees up quickly

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
   try {
    // Pass HF token if set (gives higher queue priority on ZeroGPU spaces)
    const hf_token = process.env.HF_TOKEN || undefined;
    const app = await client(HF_SPACE, {
      hf_token,
      // Log queue position updates so we can see wait time in server logs
      status_callback: (status) => {
        if (status.queue) {
          console.log(
            `[IDM-VTON] Queue position: ${status.rank ?? "?"} / ${status.queue_size ?? "?"}`,
          );
        } else if (status.stage) {
          console.log(`[IDM-VTON] Status: ${status.stage}`);
        }
      },
    });

    // ── Build prompts ────────────────────────────────────────────────────────
    const finalGarmentPrompt =
      garmentPrompt ?? buildGarmentPrompt(productTitle, category, productTags);
    const finalPersonPrompt = personPrompt ?? DEFAULT_PERSON_PROMPT;

    console.log("[IDM-VTON] Garment prompt:", finalGarmentPrompt);
    console.log("[IDM-VTON] Person prompt:", finalPersonPrompt);

    // ── Prepare image blobs ──────────────────────────────────────────────────
    console.log("[IDM-VTON] Converting person photo to Blob...");
    const personBuffer = Buffer.from(personImageBase64, "base64");
    const personBlob = new Blob([personBuffer], { type: "image/jpeg" });
    console.log("[IDM-VTON] Person Blob size:", personBlob.size);

    console.log("[IDM-VTON] Fetching garment image:", garmentImageUrl);
    const garmResponse = await fetch(garmentImageUrl);
    if (!garmResponse.ok)
      throw new Error(`Failed to fetch garment image: ${garmResponse.statusText}`);
    const garmBlob = await garmResponse.blob();
    console.log("[IDM-VTON] Garment Blob size:", garmBlob.size);

    // ── IDM-VTON expects person image as a composited object ─────────────────
    // The /tryon endpoint expects: { background, layers, composite }
    // We pass the person image as both background and composite.
    const personImgObj = {
      background: personBlob,
      layers: [],
      composite: personBlob,
    };

    // ── Call IDM-VTON (endpoint: /tryon) ─────────────────────────────────────
    // Parameter order for yisol/IDM-VTON:
    //   1. person_img  (ImageEditor dict)
    //   2. garm_img    (Image blob)
    //   3. garment_des (string)   ← text prompt for garment only
    //   4. is_checked  (bool)     ← auto masking
    //   5. is_checked_crop (bool) ← auto crop/align
    //   6. denoise_steps (int, min 20)
    //   7. seed (int)
    // NOTE: yisol/IDM-VTON does NOT have a person_des parameter.
    console.log(`[IDM-VTON] Calling /tryon, steps=${DENOISE_STEPS}...`);
    const result = await app.predict("/tryon", [
      personImgObj,           // 1. person_img
      garmBlob,               // 2. garm_img
      finalGarmentPrompt,     // 3. garment_des
      true,                   // 4. is_checked  — auto masking
      true,                   // 5. is_checked_crop — auto crop/align
      DENOISE_STEPS,          // 6. denoise_steps (min 20)
      42,                     // 7. seed
    ]);

    console.log("[IDM-VTON] Prediction finished. Parsing output...");

    // ── Parse output ─────────────────────────────────────────────────────────
    // IDM-VTON returns [result_image, masked_image] where each is a file URL.
    // result.data[0] is the try-on output image.
    let outputUrl = null;

    if (result.data && result.data[0]) {
      const first = result.data[0];
      // Could be a string URL, or an object with .url
      if (typeof first === "string") {
        outputUrl = first;
      } else if (first?.url) {
        outputUrl = first.url;
      } else if (first?.image?.url) {
        outputUrl = first.image.url;
      }
    }

    if (outputUrl && typeof outputUrl === "string") {
      console.log("[IDM-VTON] ✅ Success! Output URL:", outputUrl);
      return { status: "completed", output: outputUrl };
    }

    throw new Error(
      "No output image found in IDM-VTON response. Data: " +
        JSON.stringify(result.data).substring(0, 500),
    );
   } catch (err) {
    const isGpuError =
      err.message?.includes("No GPU") ||
      err.message?.includes("no gpu") ||
      err.message?.includes("GPU was not available") ||
      err.message?.includes("Retry later");

    if (isGpuError && attempt < MAX_RETRIES) {
      console.warn(
        `[IDM-VTON] ⚠️ No GPU available (attempt ${attempt}/${MAX_RETRIES}). ` +
          `Retrying in ${RETRY_DELAY_MS / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue; // retry the loop
    }

    // Non-GPU error or last attempt — give up
    console.error(
      `[IDM-VTON] ❌ FATAL ERROR (attempt ${attempt}/${MAX_RETRIES}):`,
      err,
    );
    return {
      status: "failed",
      error: `${err.name}: ${err.message}`,
    };
   }
  }

  // Should not reach here, but safety net
  return { status: "failed", error: "IDM-VTON: max retries exceeded" };
}
