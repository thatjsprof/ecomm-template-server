import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { ShippingOption } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import { param } from "../utils/helpers";
import { siteConfig } from "../config/site";

const router = Router();
const shippingOptions = () => AppDataSource.getRepository(ShippingOption);

const shippingOptionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().default(""),
  price: z.number().min(0, "Price cannot be negative"),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const updateShippingOptionSchema = shippingOptionSchema.partial();

async function ensureDefaultOptions() {
  const count = await shippingOptions().count();
  if (count > 0) return;

  const defaults = siteConfig.defaultShippingOptions.map((option, index) =>
    shippingOptions().create({
      name: option.name,
      description: option.description,
      price: String(option.price),
      active: true,
      sortOrder: index,
    })
  );

  await shippingOptions().save(defaults);
}

/** Public checkout list — active options only */
router.get("/", async (_req, res) => {
  try {
    await ensureDefaultOptions();

    const options = await shippingOptions().find({
      where: { active: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });

    return success(res, {
      currency: siteConfig.currency,
      options: options.map((option) => ({
        id: option.id,
        name: option.name,
        description: option.description,
        price: Number(option.price),
      })),
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch shipping options", 500);
  }
});

/** Admin list — includes inactive */
router.get("/admin/all", authenticate, requireAdmin, async (_req, res) => {
  try {
    await ensureDefaultOptions();

    const options = await shippingOptions().find({
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });

    return success(
      res,
      options.map((option) => ({
        ...option,
        price: Number(option.price),
      }))
    );
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch shipping options", 500);
  }
});

router.post(
  "/",
  authenticate,
  requireAdmin,
  validate(shippingOptionSchema),
  async (req, res) => {
    try {
      const created = shippingOptions().create({
        name: req.body.name,
        description: req.body.description || "",
        price: String(req.body.price),
        active: req.body.active ?? true,
        sortOrder: req.body.sortOrder ?? 0,
      });

      await shippingOptions().save(created);
      return success(
        res,
        { ...created, price: Number(created.price) },
        201
      );
    } catch (err) {
      console.error(err);
      return error(res, "Failed to create shipping option", 500);
    }
  }
);

router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validate(updateShippingOptionSchema),
  async (req, res) => {
    try {
      const option = await shippingOptions().findOne({
        where: { id: param(req.params.id) },
      });

      if (!option) {
        return error(res, "Shipping option not found", 404);
      }

      if (req.body.name !== undefined) option.name = req.body.name;
      if (req.body.description !== undefined) option.description = req.body.description;
      if (req.body.price !== undefined) option.price = String(req.body.price);
      if (req.body.active !== undefined) option.active = req.body.active;
      if (req.body.sortOrder !== undefined) option.sortOrder = req.body.sortOrder;

      await shippingOptions().save(option);
      return success(res, { ...option, price: Number(option.price) });
    } catch (err) {
      console.error(err);
      return error(res, "Failed to update shipping option", 500);
    }
  }
);

router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const option = await shippingOptions().findOne({
      where: { id: param(req.params.id) },
    });

    if (!option) {
      return error(res, "Shipping option not found", 404);
    }

    await shippingOptions().remove(option);
    return success(res, { message: "Shipping option deleted" });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to delete shipping option", 500);
  }
});

export default router;
