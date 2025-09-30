import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/product.js";
import orderRoutes from "./routes/order.js";
import { startOrderCron } from "./cron/orderCron.js";
import walletRoutes from "./routes/walletRoutes.js";
import freelanceRoutes from "./routes/freelanceRoutes.js";
import withdrawalRoutes from "./routes/withdrawalRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";

// ...
app.use("/api/payments", paymentRoutes);
// ...
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/freelance", freelanceRoutes);
app.use("/api/wallet", walletRoutes);
// Lancer les crons
startOrderCron();
app.use("/api/orders", orderRoutes);
app.use("/api/products", productRoutes);
// ... existing server.js content ...

app.use("/api/auth", authRoutes);

// keep the rest and start server

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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
