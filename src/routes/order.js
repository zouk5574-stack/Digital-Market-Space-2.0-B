// routes/order.js
import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import {
  createOrder,
  listMyOrders,
  listMySales,
  updateOrderStatus
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/", authenticateJWT, createOrder);
router.get("/mine", authenticateJWT, listMyOrders);
router.get("/sales", authenticateJWT, listMySales);
router.put("/:id", authenticateJWT, updateOrderStatus);

export default router;
