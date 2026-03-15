import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

// ── MVC imports ───────────────────────────────────────────────────────────────
import shopify from "./backend/config/shopify.js";
import apiRoutes from "./backend/routes/index.js";
import {
  begin,
  callbackMiddlewares,
  processWebhooks,
} from "./backend/controllers/authController.js";
import { requireInstalled } from "./backend/middlewares/auth.js";
import { errorHandler } from "./backend/middlewares/errorHandler.js";

// ── Bootstrap DB (runs migrations on startup) ─────────────────────────────────
import "./backend/config/database.js";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10,
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// ── Shopify OAuth & Webhooks (no session validation on these) ─────────────────
app.get(shopify.config.auth.path, begin);
callbackMiddlewares.forEach((mw) =>
  app.get(shopify.config.auth.callbackPath, mw),
);
app.post(shopify.config.webhooks.path, processWebhooks);

// ── API routes (protected — requireAuth is applied inside apiRoutes) ──────────
app.use(express.json());
app.use("/api", apiRoutes);

// ── Shopify CSP headers + static assets ──────────────────────────────────────
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

// ── SPA fallback — serve index.html for all remaining routes ─────────────────
app.use("/*", requireInstalled, async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || ""),
    );
});

// ── Global error handler (must be LAST middleware) ────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(
    `[server] Running on port ${PORT} (${
      process.env.NODE_ENV ?? "development"
    })`,
  );
});
