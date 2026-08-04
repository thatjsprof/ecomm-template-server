import { Resend } from "resend";
import { siteConfig } from "../config/site";
import type { Order } from "../entities";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping email:", params.subject);
    return false;
  }

  const { error } = await resend.emails.send({
    from: siteConfig.email.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    console.error("Resend error:", error);
    return false;
  }

  return true;
}

function formatMoney(value: string | number): string {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: siteConfig.currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyAdminNewOrder(order: Order): Promise<void> {
  const adminEmail = siteConfig.email.adminTo;
  if (!adminEmail) {
    console.warn("ADMIN_EMAIL not set — skipping order notification");
    return;
  }

  const address = order.shippingAddress || {};
  const items = (order.items || [])
    .map((item) => {
      const name = item.product?.name || "Product";
      const attrs = item.variantAttributes
        ? ` (${Object.values(item.variantAttributes).join(" / ")})`
        : "";
      return `<li>${escapeHtml(name)}${escapeHtml(attrs)} × ${item.quantity} — ${formatMoney(item.price)}</li>`;
    })
    .join("");

  const adminUrl = `${siteConfig.frontendUrl}/admin/orders`;

  await sendEmail({
    to: adminEmail,
    subject: `New order ${order.orderNumber} · ${siteConfig.name}`,
    html: `
      <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #171717;">
        <h2 style="margin: 0 0 12px;">New order received</h2>
        <p style="margin: 0 0 16px;">
          <strong>${escapeHtml(order.orderNumber)}</strong> · ${formatMoney(order.total)}
        </p>
        <p style="margin: 0 0 8px;"><strong>Customer</strong><br/>
          ${escapeHtml(order.customerName)}<br/>
          ${escapeHtml(order.customerEmail)}<br/>
          ${escapeHtml(order.customerPhone)}
        </p>
        <p style="margin: 16px 0 8px;"><strong>Ship to</strong><br/>
          ${escapeHtml(address.address || "")}<br/>
          ${escapeHtml([address.city, address.state, address.country].filter(Boolean).join(", "))}
        </p>
        <p style="margin: 16px 0 8px;"><strong>Items</strong></p>
        <ul style="margin: 0 0 16px; padding-left: 18px;">${items || "<li>No items</li>"}</ul>
        <p style="margin: 0 0 4px;">Subtotal: ${formatMoney(order.subtotal)}</p>
        <p style="margin: 0 0 4px;">Shipping${order.shippingMethod ? ` (${escapeHtml(order.shippingMethod)})` : ""}: ${formatMoney(order.shipping)}</p>
        <p style="margin: 0 0 4px;">Discount: ${formatMoney(order.discount)}</p>
        <p style="margin: 0 0 16px;"><strong>Total: ${formatMoney(order.total)}</strong></p>
        <p style="margin: 0 0 4px;">Payment: ${escapeHtml(order.paymentProvider || "n/a")} · ${escapeHtml(String(order.paymentStatus))}</p>
        <p style="margin: 16px 0 0;">
          <a href="${adminUrl}">View in admin</a>
        </p>
      </div>
    `,
  });
}

const STATUS_COPY: Record<
  string,
  { label: string; message: string }
> = {
  PENDING: {
    label: "Pending",
    message: "We’ve received your order and it’s waiting to be confirmed.",
  },
  PAID: {
    label: "Paid",
    message: "Payment for your order was successful. We’ll start preparing it shortly.",
  },
  PROCESSING: {
    label: "Processing",
    message: "Your order is being prepared.",
  },
  SHIPPED: {
    label: "Shipped",
    message: "Your order is on its way.",
  },
  DELIVERED: {
    label: "Delivered",
    message: "Your order has been marked as delivered. We hope you enjoy it.",
  },
  CANCELLED: {
    label: "Cancelled",
    message: "Your order has been cancelled. If you have questions, reply to this email or contact us.",
  },
};

export async function notifyCustomerOrderStatus(
  order: Order,
  previousStatus?: string
): Promise<void> {
  const to = order.customerEmail;
  if (!to) {
    console.warn("Order missing customer email — skipping status notification");
    return;
  }

  if (previousStatus && previousStatus === order.status) {
    return;
  }

  const copy = STATUS_COPY[order.status] || {
    label: String(order.status),
    message: `Your order status is now ${order.status}.`,
  };

  const ordersUrl = `${siteConfig.frontendUrl}/orders`;

  await sendEmail({
    to,
    subject: `Order ${order.orderNumber} · ${copy.label} · ${siteConfig.name}`,
    html: `
      <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #171717;">
        <h2 style="margin: 0 0 12px;">Order update</h2>
        <p style="margin: 0 0 12px;">Hi ${escapeHtml(order.customerName || "there")},</p>
        <p style="margin: 0 0 16px;">
          Your order <strong>${escapeHtml(order.orderNumber)}</strong> is now
          <strong>${escapeHtml(copy.label)}</strong>.
        </p>
        <p style="margin: 0 0 16px;">${escapeHtml(copy.message)}</p>
        <p style="margin: 0 0 4px;">Total: ${formatMoney(order.total)}</p>
        ${
          order.shippingMethod
            ? `<p style="margin: 0 0 16px;">Shipping: ${escapeHtml(order.shippingMethod)}</p>`
            : ""
        }
        <p style="margin: 16px 0 0;">
          <a href="${ordersUrl}">View your orders</a>
        </p>
        <p style="margin: 24px 0 0; color: #737373; font-size: 13px;">
          ${escapeHtml(siteConfig.name)}
        </p>
      </div>
    `,
  });
}
