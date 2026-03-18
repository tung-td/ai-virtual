/**
 * try-on-widget.js — Fitly Virtual Try-On storefront widget.
 * Vanilla JS, Standard DOM (no Shadow DOM for max compatibility).
 *
 * Initialization modes:
 *   1. App Embed (recommended) — FitlyConfig global injected by fitly-embed.liquid.
 *      The script auto-finds the Add-to-Cart form via INJECTION_SELECTOR and
 *      appends the Try-On button after the form's closing tag.
 *
 *   2. Legacy app block — reads data-* attributes from #ai-tryon-widget-root.
 */
(function () {
  "use strict";

  // ─── 1. Read configuration ──────────────────────────────────────────
  let PRODUCT_ID, GARMENT_URL, APP_URL, SHOP_DOMAIN, CTA_TEXT, PRIMARY_COLOR,
      SESSION_KEY, INJECTION_SELECTOR, injectionTarget;

  const cfg = window.FitlyConfig;

  if (cfg) {
    // App Embed mode
    PRODUCT_ID       = cfg.PRODUCT_ID ? String(cfg.PRODUCT_ID) : null;
    GARMENT_URL      = cfg.GARMENT_URL || null;
    APP_URL          = (cfg.APP_URL || "").replace(/\/$/, "");
    SHOP_DOMAIN      = cfg.SHOP_DOMAIN || "";
    CTA_TEXT         = cfg.CTA_TEXT || "Try On with Fitly";
    PRIMARY_COLOR    = cfg.PRIMARY_COLOR || "#6366f1";
    INJECTION_SELECTOR = cfg.INJECTION_SELECTOR || "form[action*='/cart/add']";
  } else {
    // Legacy App Block mode
    const root = document.getElementById("ai-tryon-widget-root");
    if (!root) return;
    if (root.dataset.initialized) return;
    root.dataset.initialized = "true";
    PRODUCT_ID    = root.dataset.productId;
    GARMENT_URL   = root.dataset.garmentUrl;
    APP_URL       = (root.dataset.appUrl || "").replace(/\/$/, "");
    SHOP_DOMAIN   = root.dataset.shopDomain;
    CTA_TEXT      = root.dataset.ctaText || "Try On";
    PRIMARY_COLOR = root.dataset.primaryColor || "#6366f1";
    injectionTarget = root; // inject button directly into the root element
  }

  // Deduplicate (widget may be loaded multiple times on SPAs)
  if (window.__fitlyWidgetInit) return;
  window.__fitlyWidgetInit = true;

  // In App Embed mode: only show on product page (PRODUCT_ID must be set)
  if (cfg && !PRODUCT_ID) return;

  SESSION_KEY = `fitly_tryon_result_${PRODUCT_ID}`;
  const POLL_INTERVAL_MS = 2000;


  // ─────────────────────────────────────────────
  // 1. Inject global scoped styles
  // ─────────────────────────────────────────────
  const styleId = "ai-tryon-global-styles";
  if (!document.getElementById(styleId)) {
    const styleNode = document.createElement("style");
    styleNode.id = styleId;
    styleNode.textContent = getStyles(PRIMARY_COLOR);
    document.head.appendChild(styleNode);
  }

  // ─────────────────────────────────────────────
  // 2. Render: "Try On" trigger button
  // ─────────────────────────────────────────────
  const triggerBtn = document.createElement("button");
  triggerBtn.className = "ai-tryon-btn";
  triggerBtn.setAttribute("aria-label", CTA_TEXT);
  triggerBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
    <span>${CTA_TEXT}</span>
  `;

  // ── Inject trigger button ──────────────────────────────────────────
  if (cfg) {
    // App Embed mode: find the Add-to-Cart form and inject after it.
    // Retries up to 10 times (50ms apart) for themes that render the form late.
    let attempts = 0;
    function tryInject() {
      const form = document.querySelector(INJECTION_SELECTOR);
      if (form) {
        form.insertAdjacentElement("afterend", triggerBtn);
      } else if (++attempts < 10) {
        setTimeout(tryInject, 50);
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryInject);
    } else {
      tryInject();
    }
  } else {
    // Legacy block mode: append into root element
    injectionTarget.appendChild(triggerBtn);
  }

  // ─────────────────────────────────────────────
  // 3. Modal markup
  // ─────────────────────────────────────────────
  const modal = document.createElement("div");
  modal.className = "ai-tryon-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "AI Virtual Try-On");
  modal.innerHTML = `
    <div class="ai-tryon-backdrop"></div>
    <div class="ai-tryon-sheet">
      <div class="ai-tryon-header">
        <span class="ai-tryon-title">AI Virtual Try-On</span>
        <button class="ai-tryon-close" aria-label="Đóng">✕</button>
      </div>

      <div class="ai-tryon-body">
        <!-- Upload Area -->
        <div class="ai-tryon-upload-area" id="ai-tryon-upload-area">
          <div class="ai-tryon-drop-zone" id="ai-tryon-drop-zone">
             <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="M21 15l-5-5L5 21"/>
             </svg>
             <p class="ai-tryon-drop-text">Kéo thả ảnh vào đây<br><span>hoặc</span></p>
             <label class="ai-tryon-file-label">
                Chọn ảnh của bạn
                <input type="file" id="ai-tryon-file-input" accept="image/jpeg,image/png,image/webp,image/heic" hidden>
             </label>
             <p class="ai-tryon-hint">JPG / PNG / WEBP / HEIC · Tối đa 20 MB</p>
          </div>
          <div class="ai-tryon-preview-wrap ai-tryon-hidden" id="ai-tryon-preview-wrap">
             <img id="ai-tryon-preview-img" class="ai-tryon-preview-img" alt="Ảnh xem trước" />
             <button class="ai-tryon-change-photo" id="ai-tryon-change-photo">Đổi ảnh</button>
          </div>
          <button class="ai-tryon-submit-btn" id="ai-tryon-submit-btn" disabled>
             Thử ngay 🚀
          </button>
        </div>

        <!-- Processing State -->
        <div class="ai-tryon-processing ai-tryon-hidden" id="ai-tryon-processing">
           <div class="ai-tryon-spinner"></div>
           <p class="ai-tryon-processing-text">AI đang xử lý ảnh của bạn…</p>
           <p class="ai-tryon-processing-sub">Khoảng 10–15 giây</p>
        </div>

        <!-- Result State -->
        <div class="ai-tryon-result-area ai-tryon-hidden" id="ai-tryon-result-area">
           <img id="ai-tryon-result-img" class="ai-tryon-result-img" alt="Kết quả Try-On" />
           <div class="ai-tryon-result-actions">
              <button class="ai-tryon-retry-btn" id="ai-tryon-retry-btn">Thử lại</button>
              <a id="ai-tryon-share-btn" class="ai-tryon-share-btn" download="try-on-result.jpg">Tải ảnh</a>
           </div>
        </div>

        <!-- Error State -->
        <div class="ai-tryon-error ai-tryon-hidden" id="ai-tryon-error">
           <p class="ai-tryon-error-text" id="ai-tryon-error-text">Đã xảy ra lỗi.</p>
           <button class="ai-tryon-retry-btn" id="ai-tryon-error-retry">Thử lại</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // ─────────────────────────────────────────────
  // 4. Element refs
  // ─────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const backdrop = modal.querySelector(".ai-tryon-backdrop");
  const closeBtn = modal.querySelector(".ai-tryon-close");
  const fileInput = $("ai-tryon-file-input");
  const dropZone = $("ai-tryon-drop-zone");
  const previewWrap = $("ai-tryon-preview-wrap");
  const previewImg = $("ai-tryon-preview-img");
  const changePhoto = $("ai-tryon-change-photo");
  const submitBtn = $("ai-tryon-submit-btn");
  const processing = $("ai-tryon-processing");
  const uploadArea = $("ai-tryon-upload-area");
  const resultArea = $("ai-tryon-result-area");
  const resultImg = $("ai-tryon-result-img");
  const shareBtn = $("ai-tryon-share-btn");
  const retryBtn = $("ai-tryon-retry-btn");
  const errorDiv = $("ai-tryon-error");
  const errorText = $("ai-tryon-error-text");
  const errorRetry = $("ai-tryon-error-retry");

  let selectedFile = null;
  let pollTimer = null;

  // ─────────────────────────────────────────────
  // 5. Open / close modal
  // ─────────────────────────────────────────────
  function openModal() {
    modal.classList.add("ai-tryon-open");
    document.body.style.overflow = "hidden";

    // Check sessionStorage cache
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      showResult(cached);
    }
  }

  function closeModal() {
    modal.classList.remove("ai-tryon-open");
    document.body.style.overflow = "";
    clearInterval(pollTimer);
  }

  triggerBtn.addEventListener("click", openModal);
  backdrop.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // ─────────────────────────────────────────────
  // 6. File selection
  // ─────────────────────────────────────────────
  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    selectedFile = file;
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    dropZone.classList.add("ai-tryon-hidden");
    previewWrap.classList.remove("ai-tryon-hidden");
    submitBtn.disabled = false;
  }

  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  changePhoto.addEventListener("click", () => {
    fileInput.value = "";
    selectedFile = null;
    previewWrap.classList.add("ai-tryon-hidden");
    dropZone.classList.remove("ai-tryon-hidden");
    submitBtn.disabled = true;
  });

  // Drag & drop
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () =>
    dropZone.classList.remove("drag-over"),
  );
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    handleFile(e.dataTransfer.files[0]);
  });

  // ─────────────────────────────────────────────
  // 7. Submit
  // ─────────────────────────────────────────────
  submitBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    showProcessing();

    try {
      const formData = new FormData();
      formData.append("person_photo", selectedFile);
      formData.append("product_id", `gid://shopify/Product/${PRODUCT_ID}`);
      formData.append("category", "auto");
      formData.append("shop", SHOP_DOMAIN);

      const res = await fetch(`${APP_URL}/api/storefront/tryon/submit`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Submit failed: ${res.status}`);
      }

      const { jobId } = await res.json();
      startPolling(jobId);
    } catch (e) {
      showError(e.message);
    }
  });

  // ─────────────────────────────────────────────
  // 8. Polling
  // ─────────────────────────────────────────────
  function startPolling(jobId) {
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 2 min timeout

    pollTimer = setInterval(async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(pollTimer);
        showError("Hết thời gian chờ. Vui lòng thử lại.");
        return;
      }

      try {
        const res = await fetch(
          `${APP_URL}/api/storefront/tryon/${jobId}/status?shop=${SHOP_DOMAIN}`,
        );
        if (!res.ok) return;
        const { job } = await res.json();

        if (job.status === "done" && job.result_url) {
          clearInterval(pollTimer);
          sessionStorage.setItem(SESSION_KEY, job.result_url);
          showResult(job.result_url);
        } else if (job.status === "failed") {
          clearInterval(pollTimer);
          showError(job.error || "AI generation failed.");
        }
      } catch (e) {
        // network hiccup — keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  // ─────────────────────────────────────────────
  // 9. State display helpers
  // ─────────────────────────────────────────────
  function hideAll() {
    uploadArea.classList.add("ai-tryon-hidden");
    processing.classList.add("ai-tryon-hidden");
    resultArea.classList.add("ai-tryon-hidden");
    errorDiv.classList.add("ai-tryon-hidden");
  }

  function showProcessing() {
    hideAll();
    processing.classList.remove("ai-tryon-hidden");
  }

  function showResult(url) {
    hideAll();
    resultImg.src = url;
    shareBtn.href = url;
    resultArea.classList.remove("ai-tryon-hidden");
  }

  function showError(msg) {
    hideAll();
    errorText.textContent = msg;
    errorDiv.classList.remove("ai-tryon-hidden");
  }

  function resetToUpload() {
    clearInterval(pollTimer);
    selectedFile = null;
    fileInput.value = "";
    previewImg.src = "";
    previewWrap.classList.add("ai-tryon-hidden");
    dropZone.classList.remove("ai-tryon-hidden");
    submitBtn.disabled = true;
    hideAll();
    uploadArea.classList.remove("ai-tryon-hidden");
  }

  retryBtn.addEventListener("click", resetToUpload);
  errorRetry.addEventListener("click", resetToUpload);

  // ─────────────────────────────────────────────
  // 10. Styles factory
  // ─────────────────────────────────────────────
  function getStyles(color) {
    return `
      .ai-tryon-hidden { display: none !important; }

      /* Trigger button */
      .ai-tryon-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        background: ${color};
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s, transform 0.15s;
        width: 100%;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .ai-tryon-btn:hover { opacity: 0.88; transform: translateY(-1px); }
      .ai-tryon-btn:active { transform: translateY(0); }

      /* Modal */
      .ai-tryon-modal {
        display: none;
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .ai-tryon-modal.ai-tryon-open { display: flex; align-items: flex-end; justify-content: center; }

      .ai-tryon-backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(4px);
        animation: ai-tryon-fadeIn 0.2s ease;
      }

      .ai-tryon-sheet {
        position: relative;
        background: #fff;
        border-radius: 20px 20px 0 0;
        width: 100%;
        max-width: 540px;
        max-height: 92vh;
        overflow-y: auto;
        animation: ai-tryon-slideUp 0.3s cubic-bezier(0.32,0.72,0,1);
        z-index: 10;
        box-sizing: border-box;
      }

      @media (min-width: 600px) {
        .ai-tryon-modal.ai-tryon-open { align-items: center; }
        .ai-tryon-sheet { border-radius: 20px; max-height: 88vh; }
      }

      .ai-tryon-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 12px;
        border-bottom: 1px solid #f0f0f0;
        position: sticky;
        top: 0;
        background: #fff;
        z-index: 11;
      }
      .ai-tryon-title { font-size: 17px; font-weight: 700; color: #111; margin: 0; }
      .ai-tryon-close {
        background: #f5f5f5;
        border: none;
        border-radius: 50%;
        width: 32px; height: 32px;
        cursor: pointer;
        font-size: 16px;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
        padding: 0; margin: 0;
        color: #111;
      }
      .ai-tryon-close:hover { background: #e8e8e8; }

      .ai-tryon-body { padding: 20px; }

      /* Upload area */
      .ai-tryon-drop-zone {
        border: 2px dashed #d0d0d0;
        border-radius: 14px;
        padding: 32px 20px;
        text-align: center;
        cursor: pointer;
        transition: border-color 0.2s, background 0.2s;
        box-sizing: border-box;
      }
      .ai-tryon-drop-zone.drag-over { border-color: ${color}; background: ${color}18; }
      .ai-tryon-drop-zone svg { color: #aaa; margin-bottom: 12px; }
      .ai-tryon-drop-text { color: #555; font-size: 14px; margin: 8px 0; }
      .ai-tryon-drop-text span { color: #999; }
      .ai-tryon-hint { font-size: 12px; color: #bbb; margin-top: 8px; }
      .ai-tryon-file-label {
        display: inline-block;
        padding: 8px 20px;
        background: ${color};
        color: #fff;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin: 8px 0;
        transition: opacity 0.2s;
      }
      .ai-tryon-file-label:hover { opacity: 0.88; }

      /* Preview */
      .ai-tryon-preview-wrap { text-align: center; margin-bottom: 12px; }
      .ai-tryon-preview-img {
        max-height: 220px;
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
      }
      .ai-tryon-change-photo {
        display: block;
        margin: 10px auto 0;
        background: none;
        border: none;
        color: ${color};
        font-size: 13px;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
      }

      /* Submit button */
      .ai-tryon-submit-btn {
        width: 100%;
        padding: 14px;
        background: ${color};
        color: #fff;
        border: none;
        border-radius: 10px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        margin-top: 16px;
        transition: opacity 0.2s;
        box-sizing: border-box;
      }
      .ai-tryon-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .ai-tryon-submit-btn:not(:disabled):hover { opacity: 0.88; }

      /* Processing */
      .ai-tryon-processing { text-align: center; padding: 40px 20px; }
      .ai-tryon-spinner {
        width: 48px; height: 48px;
        border: 4px solid #f0f0f0;
        border-top-color: ${color};
        border-radius: 50%;
        animation: ai-tryon-spin 0.9s linear infinite;
        margin: 0 auto 20px;
      }
      .ai-tryon-processing-text { font-size: 16px; font-weight: 600; color: #222; margin: 0 0 6px; }
      .ai-tryon-processing-sub { font-size: 13px; color: #888; margin: 0; }

      /* Result */
      .ai-tryon-result-area { text-align: center; }
      .ai-tryon-result-img {
        max-width: 100%;
        max-height: 380px;
        border-radius: 14px;
        object-fit: contain;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      }
      .ai-tryon-result-actions {
        display: flex;
        gap: 12px;
        margin-top: 16px;
        justify-content: center;
      }
      .ai-tryon-retry-btn {
        padding: 10px 24px;
        background: #f5f5f5;
        color: #111;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .ai-tryon-retry-btn:hover { background: #e8e8e8; }
      .ai-tryon-share-btn {
        padding: 10px 24px;
        background: ${color};
        color: #fff;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
        transition: opacity 0.2s;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .ai-tryon-share-btn:hover { opacity: 0.88; }

      /* Error */
      .ai-tryon-error { text-align: center; padding: 32px 20px; }
      .ai-tryon-error-text { color: #c0392b; font-size: 15px; margin-bottom: 16px; }

      /* Animations */
      @keyframes ai-tryon-slideUp {
        from { transform: translateY(60px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes ai-tryon-fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes ai-tryon-spin {
        to { transform: rotate(360deg); }
      }
    `;
  }

})();
