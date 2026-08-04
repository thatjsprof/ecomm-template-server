import { Router, Request, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { Order, PaymentStatus } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { param } from "../utils/helpers";
import {
  initializePaystack,
  verifyPaystack,
  verifyPaystackWebhook,
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

router.post("/paystack", validate(initSchema), async (req, res) => {
  try {
    const order = await orders().findOne({ where: { id: req.body.orderId } });

    if (!order) {
      return error(res, "Order not found", 404);
    }

    if (order.paymentStatus === PaymentStatus.SUCCESS) {
      return error(res, "Order already paid", 400);
    }

    const reference = `PSK-${order.orderNumber}-${Date.now()}`;
    const frontendUrl = siteConfig.frontendUrl;

    const result = await initializePaystack({
      email: order.customerEmail,
      amount: Number(order.total),
      reference,
      callbackUrl: `${frontendUrl}/payment/success?provider=paystack&reference=${reference}`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
    });

    order.paymentReference = result.reference;
    order.paymentProvider = "paystack";
    await orders().save(order);

    return success(res, {
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to initialize Paystack payment", 500);
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

    let paid = false;

    if (provider === "paystack") {
      const data = await verifyPaystack(reference);
      paid = data.status === "success";
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

router.post("/paystack/webhook", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-paystack-signature"] as string;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || JSON.stringify(req.body);

    if (!verifyPaystackWebhook(rawBody, signature)) {
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
