import { Router, Request, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { Order, PaymentStatus } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
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
