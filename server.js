import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";

// Import routes
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/product.js";
import orderRoutes from "./routes/order.js";
import walletRoutes from "./routes/walletRoutes.js";
import freelanceRoutes from "./routes/freelanceRoutes.js";
import withdrawalRoutes from "./routes/withdrawalRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import fedapayRoutes from "./routes/fedapayRoutes.js";
import paymentProviderRoutes from "./routes/paymentProviderRoutes.js";
import { startPaymentCron } from "./cron/paymentCron.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";
import logRoutes from "./routes/logRoutes.js";

// ...
app.use("/api/logs", logRoutes);
// ...
app.use("/api/stats", statsRoutes);
// ...
app.use("/api/notifications", notificationRoutes);
// 👉 Start crons
startOrderCron();
startPaymentCron();
// Cron jobs
import { startOrderCron } from "./cron/orderCron.js";

// Load env vars
dotenv.config();

// Init Express
const app = express();
app.use(cors());
app.use(express.json());

// Rate limiting (configurable via env or admin later)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Default route
app.get("/", (req, res) => {
  res.send("🚀 Digital Market Space Backend is running!");
});

// 👉 Register routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/freelance", freelanceRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/fedapay", fedapayRoutes);
app.use("/api/providers", paymentProviderRoutes);

// 👉 Start crons
startOrderCron();

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
