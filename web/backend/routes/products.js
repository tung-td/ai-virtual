
import { Router } from "express";
import {
  listProducts,
  setTryOnEnabled,
} from "../controllers/productController.js";

const router = Router();

// GET  /api/products          — list products with tryon metafield status
router.get("/", listProducts);

// POST /api/products/:id/tryon — enable/disable tryon for a product
router.post("/:id/tryon", setTryOnEnabled);

export default router;
