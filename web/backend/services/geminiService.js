/**
 * geminiService.js — Virtual Try-On via Google Gemini API (image editing).
 *
 * Uses `gemini-2.0-flash-exp-image-generation` to composite the customer
 * photo into a product/store setting, guided by a customisable merchant prompt.
 *
 * The call is SYNCHRONOUS (single request → image back) so there is no polling
 * step. The controller should set job status to "done" immediately after this
 * returns successfully.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/image-generation
 */




/**
 * Default prompt used when the merchant has not set a custom one.
 * Designed to produce a realistic product-store composite.
 */
export const DEFAULT_GEMINI_PROMPT =
  "You are a professional photo editor. I will give you two images:\n" +
  "1. A photo of a person (customer)\n" +
  "2. A product/garment image\n\n" +
  "Your task: Place the person wearing the garment in a clean, professional " +
  "product store setting. The result should look photorealistic, " +
  "well-lit, and suitable for an e-commerce product page. " +
  "Keep the person's face, skin tone, and body proportions exactly the same. " +
  "The garment should fit naturally on the person.";

/**
 * Fetch an image URL and return it as a base64 string plus its MIME type.
 * @param {string} url
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
async function urlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return { base64, mimeType };
}

/**
 * Run a Gemini image-generation request that composites a person photo
 * with a product image.
 *
 * @param {string} personImageBase64   - base64-encoded person photo (JPEG/PNG)
 * @param {string} garmentImageUrl     - public URL of the product/garment image
 * @param {string} [customPrompt]      - merchant-defined prompt (optional)
 * @returns {Promise<{ status: "completed"|"failed", output?: string, error?: string }>}
 *   output is a data-URI string when successful.
 */
export async function runGeminiTryOn(
  personImageBase64,
  garmentImageUrl,
  customPrompt = null,
) {
  const API_KEY = process.env.GEMINI_API_KEY;
  const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";
  const BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

  if (!API_KEY) {
    console.warn("[geminiService] GEMINI_API_KEY not set — returning mock result.");
    return {
      status: "completed",
      output:
        "https://placehold.co/864x1296/1a1a2e/ffffff?text=Gemini+Try-On%0A(No+API+Key)",
    };
  }

  try {
    const prompt = customPrompt?.trim() || DEFAULT_GEMINI_PROMPT;

    console.log("[geminiService] Fetching garment image:", garmentImageUrl);
    const { base64: garmentBase64, mimeType: garmentMime } =
      await urlToBase64(garmentImageUrl);

    console.log("[geminiService] Calling Gemini API...");

    const requestBody = {
      contents: [
        {
          parts: [
            // Text instruction
            { text: prompt },
            // Image 1: person photo
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: personImageBase64,
              },
            },
            // Image 2: garment/product image
            {
              inlineData: {
                mimeType: garmentMime,
                data: garmentBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["Text", "Image"],
      },
    };

    const res = await fetch(
      `${BASE_URL}/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg =
        errBody?.error?.message || res.statusText || "Unknown error";
      throw new Error(`Gemini API error (${res.status}): ${errMsg}`);
    }

    const data = await res.json();

    // Extract the first image part from the response
    let outputDataUri = null;
    const candidates = data?.candidates ?? [];
    for (const candidate of candidates) {
      for (const part of candidate?.content?.parts ?? []) {
        if (part?.inlineData?.data) {
          const mime = part.inlineData.mimeType || "image/jpeg";
          outputDataUri = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }
      if (outputDataUri) break;
    }

    if (!outputDataUri) {
      // Log raw response for debugging
      console.error(
        "[geminiService] Unexpected response shape:",
        JSON.stringify(data).substring(0, 500),
      );
      throw new Error(
        "Gemini returned no image in the response. " +
          (data?.candidates?.[0]?.finishReason
            ? `finishReason: ${data.candidates[0].finishReason}`
            : "Empty candidates."),
      );
    }

    console.log("[geminiService] ✅ Output image received from Gemini.");
    return { status: "completed", output: outputDataUri };
  } catch (err) {
    console.error("[geminiService] ❌ Error:", err.message);
    return { status: "failed", error: err.message };
  }
}
