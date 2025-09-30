// routes/product.js
import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import {
  createProduct,
  listAllProducts,
  listMyProducts,
  updateProduct,
  deleteProduct
} from "../controllers/productController.js";

const router = express.Router();

// Public
router.get("/", listAllProducts);

// Authenticated (seller/admin)
router.post("/", authenticateJWT, createProduct);
router.get("/mine", authenticateJWT, listMyProducts);
router.put("/:id", authenticateJWT, updateProduct);
router.delete("/:id", authenticateJWT, deleteProduct);

export default router;
