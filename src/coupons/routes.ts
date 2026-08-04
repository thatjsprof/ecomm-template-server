import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { Coupon } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import { param } from "../utils/helpers";

const router = Router();
const coupons = () => AppDataSource.getRepository(Coupon);

const createCouponSchema = z.object({
  code: z.string().min(2, "Code is required").transform((v) => v.toUpperCase()),
  percentage: z.number().int().min(1).max(100),
  expiresAt: z.string().datetime().or(z.string().min(1)),
  active: z.boolean().default(true),
});

const updateCouponSchema = createCouponSchema.partial();

router.get("/", authenticate, requireAdmin, async (_req, res) => {
  try {
    const items = await coupons().find({ order: { createdAt: "DESC" } });
    return success(res, items);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch coupons", 500);
  }
});

router.post("/", authenticate, requireAdmin, validate(createCouponSchema), async (req, res) => {
  try {
    const { code, percentage, expiresAt, active } = req.body;

    const existing = await coupons().findOne({ where: { code } });
    if (existing) {
      return error(res, "Coupon code already exists", 409);
    }

    const coupon = coupons().create({
      code,
      percentage,
      expiresAt: new Date(expiresAt),
      active,
    });
    await coupons().save(coupon);

    return success(res, coupon, 201);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to create coupon", 500);
  }
});

router.put("/:id", authenticate, requireAdmin, validate(updateCouponSchema), async (req, res) => {
  try {
    const existing = await coupons().findOne({ where: { id: param(req.params.id) } });
    if (!existing) {
      return error(res, "Coupon not found", 404);
    }

    const data = { ...req.body };
    if (data.expiresAt) {
      data.expiresAt = new Date(data.expiresAt);
    }

    coupons().merge(existing, data);
    await coupons().save(existing);

    return success(res, existing);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to update coupon", 500);
  }
});

router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await coupons().findOne({ where: { id: param(req.params.id) } });
    if (!existing) {
      return error(res, "Coupon not found", 404);
    }

    await coupons().remove(existing);

    return success(res, { message: "Coupon deleted" });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to delete coupon", 500);
  }
});

router.post(
  "/validate",
  validate(z.object({ code: z.string().min(1) })),
  async (req, res) => {
    try {
      const code = req.body.code.toUpperCase();
      const coupon = await coupons().findOne({ where: { code } });

      if (!coupon || !coupon.active || coupon.expiresAt < new Date()) {
        return error(res, "Invalid or expired coupon", 400);
      }

      return success(res, {
        code: coupon.code,
        percentage: coupon.percentage,
      });
    } catch (err) {
      console.error(err);
      return error(res, "Failed to validate coupon", 500);
    }
  }
);

export default router;
