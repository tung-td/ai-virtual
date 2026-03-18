import { Router } from "express";
import {
  listProducts,
  setProductEnabled,
  getProductMeta,
} from "../controllers/productController.js";

const router = Router();

// GET  /api/products       — list products with fitly metafield status (supports search, tag, type, cursor)
router.get("/", listProducts);

// GET  /api/products/meta  — filter options (product types + top tags)
router.get("/meta", getProductMeta);

// PUT  /api/products/fitly-enabled — set per-product fitly enable/disable metafield
router.put("/fitly-enabled", setProductEnabled);

export default router;
