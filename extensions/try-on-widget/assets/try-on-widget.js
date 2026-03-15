/**
 * try-on-widget.js — AI Virtual Try-On storefront widget.
 * Vanilla JS, Shadow DOM, < 30 KB.
 * Lazy-loaded from try-on-button.liquid.
 */
(function () {
  "use strict";

  const root = document.getElementById("ai-tryon-widget-root");
  if (!root) return;

  const PRODUCT_ID = root.dataset.productId;
  const GARMENT_URL = root.dataset.garmentUrl;
  const APP_URL = (root.dataset.appUrl || "").replace(/\/$/, "");
  const SHOP_DOMAIN = root.dataset.shopDomain;
  const CTA_TEXT = root.dataset.ctaText || "Try On";
  const PRIMARY_COLOR = root.dataset.primaryColor || "#6366f1";
  const SESSION_KEY = `ai_tryon_result_${PRODUCT_ID}`;
  const POLL_INTERVAL_MS = 2000;

  // ─────────────────────────────────────────────
  // 1. Mount Shadow DOM
  // ─────────────────────────────────────────────
  const shadow = root.attachShadow({ mode: "open" });

  // Inject scoped styles
  const style = document.createElement("style");
  style.textContent = getStyles(PRIMARY_COLOR);
  shadow.appendChild(style);

  // ─────────────────────────────────────────────
  // 2. Render: "Try On" trigger button
  // ─────────────────────────────────────────────
  const triggerBtn = document.createElement("button");
  triggerBtn.className = "tryon-btn";
  triggerBtn.setAttribute("aria-label", CTA_TEXT);
  triggerBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
    <span>${CTA_TEXT}</span>
  `;
  shadow.appendChild(triggerBtn);

  // ─────────────────────────────────────────────
  // 3. Modal markup
  // ─────────────────────────────────────────────
  const modal = document.createElement("div");
  modal.className = "tryon-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "AI Virtual Try-On");
  modal.innerHTML = `
    <div class="tryon-backdrop"></div>
    <div class="tryon-sheet">
      <div class="tryon-header">
        <span class="tryon-title">AI Virtual Try-On</span>
        <button class="tryon-close" aria-label="Đóng">✕</button>
      </div>

      <div class="tryon-body">
        <!-- Upload Area -->
        <div class="tryon-upload-area" id="tryon-upload-area">
          <div class="tryon-drop-zone" id="tryon-drop-zone">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <p class="tryon-drop-text">Kéo thả ảnh vào đây<br><span>hoặc</span></p>
            <label class="tryon-file-label">
              Chọn ảnh của bạn
              <input type="file" id="tryon-file-input" accept="image/jpeg,image/png,image/webp,image/heic" hidden>
            </label>
            <p class="tryon-hint">JPG / PNG / WEBP / HEIC · Tối đa 20 MB</p>
          </div>
          <div class="tryon-preview-wrap hidden" id="tryon-preview-wrap">
            <img id="tryon-preview-img" class="tryon-preview-img" alt="Ảnh xem trước" />
            <button class="tryon-change-photo" id="tryon-change-photo">Đổi ảnh</button>
          </div>
          <button class="tryon-submit-btn" id="tryon-submit-btn" disabled>
            Thử ngay 🚀
          </button>
        </div>

        <!-- Processing State -->
        <div class="tryon-processing hidden" id="tryon-processing">
          <div class="tryon-spinner"></div>
          <p class="tryon-processing-text">AI đang xử lý ảnh của bạn…</p>
          <p class="tryon-processing-sub">Khoảng 10–15 giây</p>
        </div>

        <!-- Result State -->
        <div class="tryon-result-area hidden" id="tryon-result-area">
          <img id="tryon-result-img" class="tryon-result-img" alt="Kết quả Try-On" />
          <div class="tryon-result-actions">
            <button class="tryon-retry-btn" id="tryon-retry-btn">Thử lại</button>
            <a id="tryon-share-btn" class="tryon-share-btn" download="try-on-result.jpg">Tải ảnh</a>
          </div>
        </div>

        <!-- Error State -->
        <div class="tryon-error hidden" id="tryon-error">
          <p class="tryon-error-text" id="tryon-error-text">Đã xảy ra lỗi.</p>
          <button class="tryon-retry-btn" id="tryon-error-retry">Thử lại</button>
        </div>
      </div>
    </div>
  `;
  shadow.appendChild(modal);

  // ─────────────────────────────────────────────
  // 4. Element refs
  // ─────────────────────────────────────────────
  const $ = (id) => shadow.getElementById(id);
  const backdrop = modal.querySelector(".tryon-backdrop");
  const closeBtn = modal.querySelector(".tryon-close");
  const fileInput = $("tryon-file-input");
  const dropZone = $("tryon-drop-zone");
  const previewWrap = $("tryon-preview-wrap");
  const previewImg = $("tryon-preview-img");
  const changePhoto = $("tryon-change-photo");
  const submitBtn = $("tryon-submit-btn");
  const processing = $("tryon-processing");
  const uploadArea = $("tryon-upload-area");
  const resultArea = $("tryon-result-area");
  const resultImg = $("tryon-result-img");
  const shareBtn = $("tryon-share-btn");
  const retryBtn = $("tryon-retry-btn");
  const errorDiv = $("tryon-error");
  const errorText = $("tryon-error-text");
  const errorRetry = $("tryon-error-retry");

  let selectedFile = null;
  let pollTimer = null;

  // ─────────────────────────────────────────────
  // 5. Open / close modal
  // ─────────────────────────────────────────────
  function openModal() {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";

    // Check sessionStorage cache
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      showResult(cached);
    }
  }

  function closeModal() {
    modal.classList.remove("open");
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
    dropZone.classList.add("hidden");
    previewWrap.classList.remove("hidden");
    submitBtn.disabled = false;
  }

  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  changePhoto.addEventListener("click", () => {
    fileInput.value = "";
    selectedFile = null;
    previewWrap.classList.add("hidden");
    dropZone.classList.remove("hidden");
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
    uploadArea.classList.add("hidden");
    processing.classList.add("hidden");
    resultArea.classList.add("hidden");
    errorDiv.classList.add("hidden");
  }

  function showProcessing() {
    hideAll();
    processing.classList.remove("hidden");
  }

  function showResult(url) {
    hideAll();
    resultImg.src = url;
    shareBtn.href = url;
    resultArea.classList.remove("hidden");
  }

  function showError(msg) {
    hideAll();
    errorText.textContent = msg;
    errorDiv.classList.remove("hidden");
  }

  function resetToUpload() {
    clearInterval(pollTimer);
    selectedFile = null;
    fileInput.value = "";
    previewImg.src = "";
    previewWrap.classList.add("hidden");
    dropZone.classList.remove("hidden");
    submitBtn.disabled = true;
    hideAll();
    uploadArea.classList.remove("hidden");
  }

  retryBtn.addEventListener("click", resetToUpload);
  errorRetry.addEventListener("click", resetToUpload);

  // ─────────────────────────────────────────────
  // 10. Styles factory
  // ─────────────────────────────────────────────
  function getStyles(color) {
    return `
      :host { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

      .hidden { display: none !important; }

      /* Trigger button */
      .tryon-btn {
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
      }
      .tryon-btn:hover { opacity: 0.88; transform: translateY(-1px); }
      .tryon-btn:active { transform: translateY(0); }

      /* Modal */
      .tryon-modal {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 99999;
      }
      .tryon-modal.open { display: flex; align-items: flex-end; justify-content: center; }

      .tryon-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(4px);
        animation: fadeIn 0.2s ease;
      }

      .tryon-sheet {
        position: relative;
        background: #fff;
        border-radius: 20px 20px 0 0;
        width: 100%;
        max-width: 540px;
        max-height: 92vh;
        overflow-y: auto;
        animation: slideUp 0.3s cubic-bezier(0.32,0.72,0,1);
        z-index: 1;
      }

      @media (min-width: 600px) {
        .tryon-modal.open { align-items: center; }
        .tryon-sheet { border-radius: 20px; max-height: 88vh; }
      }

      .tryon-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 12px;
        border-bottom: 1px solid #f0f0f0;
        position: sticky;
        top: 0;
        background: #fff;
        z-index: 2;
      }
      .tryon-title { font-size: 17px; font-weight: 700; color: #111; }
      .tryon-close {
        background: #f5f5f5;
        border: none;
        border-radius: 50%;
        width: 32px; height: 32px;
        cursor: pointer;
        font-size: 16px;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .tryon-close:hover { background: #e8e8e8; }

      .tryon-body { padding: 20px; }

      /* Upload area */
      .tryon-drop-zone {
        border: 2px dashed #d0d0d0;
        border-radius: 14px;
        padding: 32px 20px;
        text-align: center;
        cursor: pointer;
        transition: border-color 0.2s, background 0.2s;
      }
      .tryon-drop-zone.drag-over { border-color: ${color}; background: ${color}18; }
      .tryon-drop-zone svg { color: #aaa; margin-bottom: 12px; }
      .tryon-drop-text { color: #555; font-size: 14px; margin: 8px 0; }
      .tryon-drop-text span { color: #999; }
      .tryon-hint { font-size: 12px; color: #bbb; margin-top: 8px; }
      .tryon-file-label {
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
      .tryon-file-label:hover { opacity: 0.88; }

      /* Preview */
      .tryon-preview-wrap { text-align: center; margin-bottom: 12px; }
      .tryon-preview-img {
        max-height: 220px;
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
      }
      .tryon-change-photo {
        display: block;
        margin: 10px auto 0;
        background: none;
        border: none;
        color: ${color};
        font-size: 13px;
        cursor: pointer;
        text-decoration: underline;
      }

      /* Submit button */
      .tryon-submit-btn {
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
      }
      .tryon-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .tryon-submit-btn:not(:disabled):hover { opacity: 0.88; }

      /* Processing */
      .tryon-processing { text-align: center; padding: 40px 20px; }
      .tryon-spinner {
        width: 48px; height: 48px;
        border: 4px solid #f0f0f0;
        border-top-color: ${color};
        border-radius: 50%;
        animation: spin 0.9s linear infinite;
        margin: 0 auto 20px;
      }
      .tryon-processing-text { font-size: 16px; font-weight: 600; color: #222; }
      .tryon-processing-sub { font-size: 13px; color: #888; margin-top: 6px; }

      /* Result */
      .tryon-result-area { text-align: center; }
      .tryon-result-img {
        max-width: 100%;
        max-height: 380px;
        border-radius: 14px;
        object-fit: contain;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      }
      .tryon-result-actions {
        display: flex;
        gap: 12px;
        margin-top: 16px;
        justify-content: center;
      }
      .tryon-retry-btn {
        padding: 10px 24px;
        background: #f5f5f5;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .tryon-retry-btn:hover { background: #e8e8e8; }
      .tryon-share-btn {
        padding: 10px 24px;
        background: ${color};
        color: #fff;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
        transition: opacity 0.2s;
      }
      .tryon-share-btn:hover { opacity: 0.88; }

      /* Error */
      .tryon-error { text-align: center; padding: 32px 20px; }
      .tryon-error-text { color: #c0392b; font-size: 15px; margin-bottom: 16px; }

      /* Animations */
      @keyframes slideUp {
        from { transform: translateY(60px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
  }
})();
