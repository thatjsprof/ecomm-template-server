/**
 * Single place to reconfigure backend defaults for white-label reuse.
 * Secrets and deploy URLs still come from env — see `.env.example`.
 *
 * Shipping options are managed in Admin → Shipping (DB).
 * `defaultShippingOptions` is only used to seed the table when empty.
 */
import dotenv from "dotenv";

dotenv.config();

export const siteConfig = {
  name: "Atelier",
  currency: "NGN",

  appUrl: process.env.APP_URL || "http://localhost:4000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  port: Number(process.env.PORT || 4000),

  seed: {
    adminName: process.env.SEED_ADMIN_NAME || "Admin",
    adminEmail: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
    adminPassword: process.env.SEED_ADMIN_PASSWORD || "admin123",
  },
  whatsapp: {
    enabled: true,
    phone: "2348012345678",
    message: "Hi! I'd like to know more about your products.",
  },
  email: {
    /** Resend "from" address — verify domain in Resend dashboard for production */
    from: process.env.RESEND_FROM || "Atelier <onboarding@resend.dev>",
    /** Where new-order alerts go */
    adminTo: process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "admin@example.com",
  },

  /** Seeded into DB when no shipping options exist yet */
  defaultShippingOptions: [
    {
      name: "Standard delivery",
      description: "5–7 business days",
      price: 1500,
    },
    {
      name: "Express delivery",
      description: "2–3 business days",
      price: 3500,
    },
    {
      name: "Store pickup",
      description: "Collect from our store within 24 hours",
      price: 0,
    },
  ],
} as const;
