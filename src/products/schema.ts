import { z } from "zod";

export const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().min(1, "Variant SKU is required"),
  attributes: z.record(z.string()).default({}),
  price: z.number().positive().nullable().optional(),
  salePrice: z.number().positive().nullable().optional(),
  stock: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export const optionValueSchema = z.object({
  value: z.string().min(1),
  image: z.string().nullable().optional(),
});

export const optionConfigSchema = z.object({
  name: z.string().min(1),
  values: z.array(optionValueSchema).default([]),
});

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  price: z.number().positive("Price must be positive"),
  salePrice: z.number().positive().nullable().optional(),
  stock: z.number().int().min(0, "Stock cannot be negative"),
  sku: z.string().min(1, "SKU is required"),
  images: z.array(z.string()).default([]),
  optionConfig: z.array(optionConfigSchema).nullable().optional(),
  featured: z.boolean().default(false),
  newArrival: z.boolean().default(false),
  active: z.boolean().default(true),
  categoryId: z.string().min(1, "Category is required"),
  variants: z.array(variantSchema).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  search: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(["newest", "price-asc", "price-desc", "name"]).default("newest"),
  featured: z.enum(["true", "false"]).optional(),
  newArrival: z.enum(["true", "false"]).optional(),
});
