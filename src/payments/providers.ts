import axios from "axios";
import crypto from "crypto";
import { AppDataSource } from "../data-source";
import { Order, OrderStatus, PaymentStatus, Product, ProductVariant } from "../entities";
import { siteConfig } from "../config/site";
import { notifyCustomerOrderStatus } from "../lib/email";

interface InitPaymentParams {
  email: string;
  amount: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  customerName?: string;
  customerPhone?: string;
}

interface InitPaymentResult {
  authorizationUrl: string;
  reference: string;
}

function flutterwaveSecret(): string {
  const secret = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secret) {
    throw new Error("FLUTTERWAVE_SECRET_KEY is not set");
  }
  return secret;
}

export async function initializeFlutterwave(params: InitPaymentParams): Promise<InitPaymentResult> {
  const secret = flutterwaveSecret();

  const response = await axios.post(
    "https://api.flutterwave.com/v3/payments",
    {
      tx_ref: params.reference,
      amount: params.amount,
      currency: siteConfig.currency,
      redirect_url: params.callbackUrl,
      customer: {
        email: params.email,
        name: params.customerName || params.email,
        phonenumber: params.customerPhone,
      },
      customizations: {
        title: siteConfig.name,
        description: `Order payment`,
      },
      meta: params.metadata,
    },
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    authorizationUrl: response.data.data.link,
    reference: params.reference,
  };
}

/** Verify by Flutterwave transaction id, or fall back to tx_ref. */
export async function verifyFlutterwave(reference: string, transactionId?: string) {
  const secret = flutterwaveSecret();

  if (transactionId) {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: { Authorization: `Bearer ${secret}` },
      }
    );
    return response.data.data;
  }

  const response = await axios.get(
    "https://api.flutterwave.com/v3/transactions/verify_by_reference",
    {
      params: { tx_ref: reference },
      headers: { Authorization: `Bearer ${secret}` },
    }
  );

  return response.data.data;
}

/** Flutterwave sends your configured secret hash in the `verif-hash` header. */
export function verifyFlutterwaveWebhook(signature: string | undefined): boolean {
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  if (!secretHash || !signature) {
    return false;
  }
  return signature === secretHash;
}

export async function initializeKorapay(params: InitPaymentParams): Promise<InitPaymentResult> {
  const secret = process.env.KORAPAY_SECRET_KEY;
  if (!secret) {
    throw new Error("KORAPAY_SECRET_KEY is not set");
  }

  const response = await axios.post(
    "https://api.korapay.com/merchant/api/v1/charges/initialize",
    {
      amount: params.amount,
      currency: siteConfig.currency,
      reference: params.reference,
      redirect_url: params.callbackUrl,
      customer: {
        email: params.email,
      },
      notification_url: `${siteConfig.appUrl}/api/payments/korapay/webhook`,
      metadata: params.metadata,
    },
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    authorizationUrl: response.data.data.checkout_url,
    reference: response.data.data.reference,
  };
}

export async function verifyKorapay(reference: string) {
  const secret = process.env.KORAPAY_SECRET_KEY;
  if (!secret) {
    throw new Error("KORAPAY_SECRET_KEY is not set");
  }

  const response = await axios.get(
    `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
    }
  );

  return response.data.data;
}

export function verifyKorapayWebhook(body: unknown, signature: string): boolean {
  const secret = process.env.KORAPAY_SECRET_KEY;
  if (!secret) {
    return false;
  }

  const hash = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest("hex");

  return hash === signature;
}

export async function markOrderPaid(reference: string) {
  const orderRepo = AppDataSource.getRepository(Order);

  const order = await orderRepo.findOne({
    where: { paymentReference: reference },
    relations: { items: true },
  });

  if (!order) {
    return null;
  }

  if (order.paymentStatus === PaymentStatus.SUCCESS) {
    return order;
  }

  const previousStatus = order.status;

  await AppDataSource.transaction(async (manager) => {
    order.paymentStatus = PaymentStatus.SUCCESS;
    order.status = OrderStatus.PAID;
    await manager.save(order);

    for (const item of order.items) {
      if (item.variantId) {
        await manager.decrement(ProductVariant, { id: item.variantId }, "stock", item.quantity);
      } else {
        await manager.decrement(Product, { id: item.productId }, "stock", item.quantity);
      }
    }
  });

  const updated = await orderRepo.findOne({ where: { id: order.id } });

  if (updated && previousStatus !== OrderStatus.PAID) {
    void notifyCustomerOrderStatus(updated, previousStatus).catch((err) =>
      console.error("Failed to notify customer of paid status:", err)
    );
  }

  return updated;
}
