import { client } from "@gradio/client";
import fs from "fs";

/**
 * ootDiffusionService.js — Free AI Try-On via Hugging Face Spaces.
 * Uses levihsu/OOTDiffusion model.
 *
 * Note: This is an UNSTABLE and SLOW alternative.
 * Use for demo/free-tier purposes only.
 */

/**
 * Submit a try-on job to Hugging Face OOTDiffusion.
 *
 * @param {string} personImageBase64 - base64-encoded person photo
 * @param {string} garmentImageUrl   - public URL of the garment image
 * @param {string} category          - "Upper body" | "Lower body" | "Dress"
 * @returns {Promise<{ predictionId: string }>}
 */
export async function submitFreeTryOn(
  personImageBase64,
  garmentImageUrl,
  category = "Upper body",
) {
  // We use the timestamp as a fake "predictionId" since Gradio doesn't give a polling ID immediately
  // in the same way fashn.ai does for its async queue.
  // Actually, @gradio/client predict() is an async call that waits for the result.
  // But our architecture expects an immediate ID so the frontend can poll.

  // Strategy: We start the process in the background and store the "promise" or just
  // let the controller handle wait. But the PRD says 60-90s.
  // We'll return a special ID "hf_{timestamp}"

  return {
    predictionId: `hf_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  };
}

/**
 * Perform the actual Gradio call.
 * Since Gradio waits for the result, we'll call this and then update the DB.
 */
export async function runOOTDiffusion(
  personImageBase64,
  garmentImageUrl,
  category,
) {
  try {
    const app = await client("levihsu/OOTDiffusion");

    // Convert base64 to Blob/Buffer
    console.log("[OOTDiffusion] Processing person image...");
    const personBuffer = Buffer.from(personImageBase64, "base64");
    const personBlob = new Blob([personBuffer], { type: "image/jpeg" });
    console.log("[OOTDiffusion] Person Blob created, size:", personBlob.size);

    // Download garment image to Blob
    console.log("[OOTDiffusion] Fetching garment image:", garmentImageUrl);
    const garmResponse = await fetch(garmentImageUrl);
    if (!garmResponse.ok)
      throw new Error(
        `Failed to fetch garment image: ${garmResponse.statusText}`,
      );
    const garmBlob = await garmResponse.blob();
    console.log("[OOTDiffusion] Garment Blob created, size:", garmBlob.size);

    // Mapping category to OOTDiffusion expected values
    let ootCategory = "Upper body";
    const catLower = (category || "").toLowerCase();
    if (catLower.includes("bottom")) ootCategory = "Lower body";
    if (catLower.includes("dress") || catLower.includes("one-piece"))
      ootCategory = "Dress";

    console.log(
      `[OOTDiffusion] Calling app.predict (/process_dc) for category: ${ootCategory}...`,
    );

    const result = await app.predict("/process_dc", [
      personBlob, // vton_img
      garmBlob, // garm_img
      ootCategory, // category
      1, // n_samples
      20, // n_steps
      2, // image_scale
      -1, // seed
    ]);

    console.log("[OOTDiffusion] Prediction finished. Parsing data...");

    // Result parsing: Gallery output is usually at result.data[0]
    // Structure can be: [ { image: { url: ... } }, ... ]
    // OR [ null, [ { image: { url: ... } }, ... ] ]
    let outputUrl = null;

    if (result.data && result.data[0]) {
      const gallery = result.data[0];
      // Case 1: result.data[0] is the gallery array
      if (Array.isArray(gallery)) {
        const firstItem = gallery[0];
        if (firstItem) {
          outputUrl =
            firstItem.image?.url ||
            firstItem.url ||
            (typeof firstItem === "string" ? firstItem : null);
        }
      }
      // Case 2: result.data[0] is null/status, result.data[1] is the gallery (sometimes seen in OOT)
      else if (gallery === null && Array.isArray(result.data[1])) {
        const firstItem = result.data[1][0];
        if (firstItem) {
          outputUrl =
            firstItem.image?.url ||
            firstItem.url ||
            (typeof firstItem === "string" ? firstItem : null);
        }
      }
    }

    if (outputUrl && typeof outputUrl === "string") {
      console.log("[OOTDiffusion] Success! Product image URL:", outputUrl);
      return {
        status: "completed",
        output: outputUrl,
      };
    }

    throw new Error(
      "No output image found in OOTDiffusion response. Data: " +
        JSON.stringify(result.data).substring(0, 500),
    );
  } catch (err) {
    console.error("[OOTDiffusion] FATAL ERROR:", err);
    return {
      status: "failed",
      error: `${err.name}: ${err.message}`, // Include error name for better debugging
    };
  }
}
