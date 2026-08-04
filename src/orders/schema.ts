import { z } from "zod";

export const shippingAddressSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().min(1, "Email is required").email("Invalid email"),
  phone: z.string().min(1, "Phone is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  country: z.string().min(1, "Country is required"),
});

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().optional().nullable(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "Cart is empty"),
  shippingAddress: shippingAddressSchema,
  paymentProvider: z.enum(["paystack", "korapay"]),
  couponCode: z.string().optional(),
  shippingOptionId: z.string().min(1, "Shipping option is required"),
  saveAddress: z.boolean().optional(),
  addressLabel: z.string().max(60).optional().nullable(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]),
});
