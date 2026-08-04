import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import dotenv from "dotenv";

import { AppDataSource } from "./data-source";
import { errorHandler } from "./middleware/error";
import { siteConfig } from "./config/site";
import authRoutes from "./auth/routes";
import productRoutes from "./products/routes";
import categoryRoutes from "./categories/routes";
import orderRoutes from "./orders/routes";
import paymentRoutes from "./payments/routes";
import uploadRoutes from "./uploads/routes";
import userRoutes from "./users/routes";
import couponRoutes from "./coupons/routes";
import newsletterRoutes from "./newsletter/routes";
import cartRoutes from "./cart/routes";
import shippingRoutes from "./shipping/routes";
import addressRoutes from "./addresses/routes";

dotenv.config();

const app = express();
const PORT = siteConfig.port;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: siteConfig.frontendUrl,
    credentials: true,
  })
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/users", userRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/addresses", addressRoutes);

app.use(errorHandler);

async function start() {
  try {
    await AppDataSource.initialize();
    console.log("Database connected (TypeORM)");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();

export default app;
