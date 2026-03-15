/**
 * tryOnService.js — fashn.ai API integration.
 *
 * If FASHN_API_KEY is not set, falls back to a mock (2s delay, placeholder image).
 * This lets you develop and test the frontend without incurring API costs.
 *
 * API docs: https://docs.fashn.ai
 * Model: tryon-v1.6 | Output: 864×1296 JPEG | ETA: 5–17s
 */

const FASHN_BASE_URL = "https://api.fashn.ai/v1";
const FASHN_API_KEY = process.env.FASHN_API_KEY;

// Placeholder image for mock mode
const MOCK_RESULT_URL =
  "https://placehold.co/864x1296/1a1a2e/ffffff?text=Try-On+Preview\n(Mock+Mode)";

/**
 * Submit a try-on job to fashn.ai.
 *
 * @param {string} personImageBase64 - base64-encoded person photo (JPEG/PNG)
 * @param {string} garmentImageUrl   - public URL of the garment image
 * @param {string} [category]        - "tops" | "bottoms" | "one-pieces" | "auto"
 * @returns {Promise<{ predictionId: string }>}
 */
export async function submitTryOn(
  personImageBase64,
  garmentImageUrl,
  category = "auto",
) {
  if (!FASHN_API_KEY) {
    // Mock mode: return a fake predictionId
    console.warn(
      "[tryOnService] FASHN_API_KEY not set — running in MOCK mode.",
    );
    return { predictionId: `mock_${Date.now()}` };
  }

  const res = await fetch(`${FASHN_BASE_URL}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FASHN_API_KEY}`,
    },
    body: JSON.stringify({
      model_name: "tryon-v1.6",
      inputs: {
        model_image: `data:image/jpeg;base64,${personImageBase64}`,
        garment_image: garmentImageUrl,
        category,
      },
      mode: "balanced",
      output_format: "jpeg",
      return_base64: false,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `fashn.ai submit failed (${res.status}): ${
        err.message || res.statusText
      }`,
    );
  }

  const data = await res.json();
  // Response shape: { id: "pred_xxx", ... }
  return { predictionId: data.id };
}

/**
 * Poll the status of a fashn.ai prediction.
 *
 * @param {string} predictionId
 * @returns {Promise<{ status: "starting"|"in_queue"|"processing"|"completed"|"failed", output?: string, error?: string }>}
 */
export async function pollTryOnResult(predictionId) {
  // Mock mode
  if (predictionId.startsWith("mock_")) {
    const elapsed =
      Date.now() - parseInt(predictionId.replace("mock_", ""), 10);
    if (elapsed < 2000) {
      return { status: "processing" };
    }
    return { status: "completed", output: MOCK_RESULT_URL };
  }

  if (!FASHN_API_KEY) {
    throw new Error("FASHN_API_KEY not configured");
  }

  const res = await fetch(`${FASHN_BASE_URL}/status/${predictionId}`, {
    headers: {
      Authorization: `Bearer ${FASHN_API_KEY}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `fashn.ai poll failed (${res.status}): ${err.message || res.statusText}`,
    );
  }

  const data = await res.json();
  // Response shape: { id, status, output: ["url"], error }
  return {
    status: data.status, // "starting" | "in_queue" | "processing" | "completed" | "failed"
    output: Array.isArray(data.output) ? data.output[0] : data.output,
    error: data.error,
  };
}
