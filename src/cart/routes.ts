import { Router } from "express";
import { z } from "zod";
import { In } from "typeorm";
import { AppDataSource } from "../data-source";
import { CartItem, Product, ProductVariant } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
const carts = () => AppDataSource.getRepository(CartItem);
const products = () => AppDataSource.getRepository(Product);

const cartItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  variantId: z.string().optional().nullable(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

const replaceCartSchema = z.object({
  items: z.array(cartItemSchema),
});

function variantKey(variantId?: string | null): string {
  return variantId || "";
}

async function loadUserCart(userId: string) {
  return carts().find({
    where: { userId },
    relations: { product: { category: true }, variant: true },
    order: { createdAt: "ASC" },
  });
}

function toResponse(items: CartItem[]) {
  return items
    .filter((item) => item.product && item.product.active !== false)
    .map((item) => ({
      id: item.id,
      quantity: item.quantity,
      product: item.product,
      variant: item.variant || null,
    }));
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const items = await loadUserCart(req.user!.id);
    return success(res, { items: toResponse(items) });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch cart", 500);
  }
});

router.put("/", authenticate, validate(replaceCartSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const incoming = req.body.items as z.infer<typeof cartItemSchema>[];

    // Merge duplicate keys from client
    const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
    for (const item of incoming) {
      const vId = item.variantId || null;
      const key = `${item.productId}:${variantKey(vId)}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        merged.set(key, {
          productId: item.productId,
          variantId: vId,
          quantity: item.quantity,
        });
      }
    }

    const productIds = [...new Set([...merged.values()].map((i) => i.productId))];
    const foundProducts =
      productIds.length > 0
        ? await products().find({
            where: { id: In(productIds), active: true },
            relations: { variants: true },
          })
        : [];

    const productMap = new Map(foundProducts.map((p) => [p.id, p]));
    const rows: CartItem[] = [];

    for (const item of merged.values()) {
      const product = productMap.get(item.productId);
      if (!product) continue;

      const activeVariants = (product.variants || []).filter((v) => v.active);
      let variant: ProductVariant | null = null;
      let stock = product.stock;

      if (activeVariants.length > 0) {
        if (!item.variantId) continue;
        variant = activeVariants.find((v) => v.id === item.variantId) || null;
        if (!variant) continue;
        stock = variant.stock;
      } else if (item.variantId) {
        continue;
      }

      if (stock <= 0) continue;

      rows.push(
        carts().create({
          userId,
          productId: product.id,
          variantId: variant?.id || null,
          variantKey: variantKey(variant?.id),
          quantity: Math.min(item.quantity, stock),
        })
      );
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.delete(CartItem, { userId });
      if (rows.length > 0) {
        await manager.save(CartItem, rows);
      }
    });

    const saved = await loadUserCart(userId);
    return success(res, { items: toResponse(saved) });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to update cart", 500);
  }
});

router.delete("/", authenticate, async (req: AuthRequest, res) => {
  try {
    await carts().delete({ userId: req.user!.id });
    return success(res, { items: [] });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to clear cart", 500);
  }
});

export default router;
