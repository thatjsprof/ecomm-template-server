import { z } from "zod";

export const createCollectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  active: z.boolean().optional(),
  showInHero: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  productIds: z.array(z.string().uuid()).optional(),
});

export const updateCollectionSchema = createCollectionSchema.partial();
