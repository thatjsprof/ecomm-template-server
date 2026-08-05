import { Router, Request, Response } from "express";
import { IsNull, Not } from "typeorm";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { Order, PaymentStatus } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import { param } from "../utils/helpers";
import {
  initializeFlutterwave,
  verifyFlutterwave,
  verifyFlutterwaveWebhook,
  initializeKorapay,
  verifyKorapay,
  verifyKorapayWebhook,
  markOrderPaid,
} from "./providers";
import { siteConfig } from "../config/site";

const router = Router();
const orders = () => AppDataSource.getRepository(Order);

const initSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
});

router.get("/admin/stats", authenticate, requireAdmin, async (_req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [allTime, thisMonth] = await Promise.all([
      orders()
        .createQueryBuilder("o")
        .select("COALESCE(SUM(o.total::numeric), 0)", "revenue")
        .addSelect("COUNT(*)", "paidOrders")
        .where("o.paymentStatus = :status", { status: PaymentStatus.SUCCESS })
        .getRawOne<{ revenue: string; paidOrders: string }>(),
      orders()
        .createQueryBuilder("o")
        .select("COALESCE(SUM(o.total::numeric), 0)", "revenue")
        .addSelect("COUNT(*)", "paidOrders")
        .where("o.paymentStatus = :status", { status: PaymentStatus.SUCCESS })
        .andWhere("o.createdAt >= :monthStart", { monthStart })
        .getRawOne<{ revenue: string; paidOrders: string }>(),
    ]);

    return success(res, {
      revenueTotal: Number(allTime?.revenue || 0),
      revenueThisMonth: Number(thisMonth?.revenue || 0),
      paidOrders: Number(allTime?.paidOrders || 0),
      paidOrdersThisMonth: Number(thisMonth?.paidOrders || 0),
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch payment stats", 500);
  }
});

router.get("/admin", authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await orders().findAndCount({
      where: { paymentReference: Not(IsNull()) },
      skip,
      take: limit,
      order: { createdAt: "DESC" },
    });

    return success(res, {
      payments: items.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        total: order.total,
        paymentProvider: order.paymentProvider,
        paymentReference: order.paymentReference,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch payments", 500);
  }
});

router.post("/flutterwave", validate(initSchema), async (req, res) => {
  try {
    const order = await orders().findOne({ where: { id: req.body.orderId } });

    if (!order) {
      return error(res, "Order not found", 404);
    }

    if (order.paymentStatus === PaymentStatus.SUCCESS) {
      return error(res, "Order already paid", 400);
    }

    const reference = `FLW-${order.orderNumber}-${Date.now()}`;
    const frontendUrl = siteConfig.frontendUrl;

    const result = await initializeFlutterwave({
      email: order.customerEmail,
      amount: Number(order.total),
      reference,
      callbackUrl: `${frontendUrl}/payment/success?provider=flutterwave&reference=${encodeURIComponent(reference)}`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
    });

    order.paymentReference = result.reference;
    order.paymentProvider = "flutterwave";
    await orders().save(order);

    return success(res, {
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to initialize Flutterwave payment", 500);
  }
});

router.post("/korapay", validate(initSchema), async (req, res) => {
  try {
    const order = await orders().findOne({ where: { id: req.body.orderId } });

    if (!order) {
      return error(res, "Order not found", 404);
    }

    if (order.paymentStatus === PaymentStatus.SUCCESS) {
      return error(res, "Order already paid", 400);
    }

    const reference = `KORA-${order.orderNumber}-${Date.now()}`;
    const frontendUrl = siteConfig.frontendUrl;

    const result = await initializeKorapay({
      email: order.customerEmail,
      amount: Number(order.total),
      reference,
      callbackUrl: `${frontendUrl}/payment/success?provider=korapay&reference=${reference}`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
    });

    order.paymentReference = result.reference;
    order.paymentProvider = "korapay";
    await orders().save(order);

    return success(res, {
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to initialize Korapay payment", 500);
  }
});

router.get("/verify/:provider/:reference", async (req, res) => {
  try {
    const provider = param(req.params.provider);
    const reference = param(req.params.reference);
    const transactionId =
      typeof req.query.transaction_id === "string" ? req.query.transaction_id : undefined;

    let paid = false;

    if (provider === "flutterwave") {
      const data = await verifyFlutterwave(reference, transactionId);
      paid = data?.status === "successful";
    } else if (provider === "korapay") {
      const data = await verifyKorapay(reference);
      paid = data.status === "success";
    } else {
      return error(res, "Invalid payment provider", 400);
    }

    if (paid) {
      const order = await markOrderPaid(reference);
      return success(res, { paid: true, order });
    }

    return success(res, { paid: false });
  } catch (err) {
    console.error(err);
    return error(res, "Payment verification failed", 500);
  }
});

router.post("/flutterwave/webhook", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["verif-hash"] as string | undefined;

    if (!verifyFlutterwaveWebhook(signature)) {
      return error(res, "Invalid signature", 401);
    }

    const event = req.body;
    const status = event?.data?.status;
    const reference = event?.data?.tx_ref as string | undefined;

    if (reference && status === "successful") {
      await markOrderPaid(reference);
    }

    return success(res, { received: true });
  } catch (err) {
    console.error(err);
    return error(res, "Webhook processing failed", 500);
  }
});

router.post("/korapay/webhook", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-korapay-signature"] as string;

    if (!verifyKorapayWebhook(req.body, signature)) {
      return error(res, "Invalid signature", 401);
    }

    const event = req.body;

    if (event.event === "charge.success") {
      await markOrderPaid(event.data.reference);
    }

    return success(res, { received: true });
  } catch (err) {
    console.error(err);
    return error(res, "Webhook processing failed", 500);
  }
});

export default router;
