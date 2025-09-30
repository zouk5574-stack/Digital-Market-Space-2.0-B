import express from "express";
import { getWallet, requestWithdrawal, getWithdrawals } from "../controllers/walletController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateToken, getWallet);
router.post("/withdraw", authenticateToken, requestWithdrawal);
router.get("/withdrawals", authenticateToken, getWithdrawals);

export default router;
