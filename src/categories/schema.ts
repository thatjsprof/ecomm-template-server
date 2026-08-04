import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  image: z.string().nullable().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();
