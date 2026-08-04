import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { Address } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { authenticate, AuthRequest } from "../middleware/auth";
import { param } from "../utils/helpers";

const router = Router();
const addresses = () => AppDataSource.getRepository(Address);

const addressSchema = z.object({
  label: z.string().max(60).optional().nullable(),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  country: z.string().min(1, "Country is required"),
  isDefault: z.boolean().optional(),
});

async function clearDefault(userId: string, exceptId?: string) {
  const existing = await addresses().find({ where: { userId, isDefault: true } });
  for (const row of existing) {
    if (exceptId && row.id === exceptId) continue;
    row.isDefault = false;
    await addresses().save(row);
  }
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const items = await addresses().find({
      where: { userId: req.user!.id },
      order: { isDefault: "DESC", createdAt: "DESC" },
    });
    return success(res, items);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch addresses", 500);
  }
});

router.post("/", authenticate, validate(addressSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const count = await addresses().count({ where: { userId } });
    const makeDefault = req.body.isDefault === true || count === 0;

    if (makeDefault) {
      await clearDefault(userId);
    }

    const created = addresses().create({
      userId,
      label: req.body.label || null,
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
      isDefault: makeDefault,
    });

    await addresses().save(created);
    return success(res, created, 201);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to create address", 500);
  }
});

router.put("/:id", authenticate, validate(addressSchema), async (req: AuthRequest, res) => {
  try {
    const row = await addresses().findOne({
      where: { id: param(req.params.id), userId: req.user!.id },
    });

    if (!row) {
      return error(res, "Address not found", 404);
    }

    if (req.body.isDefault === true) {
      await clearDefault(req.user!.id, row.id);
    }

    addresses().merge(row, {
      label: req.body.label ?? row.label,
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
      isDefault: req.body.isDefault === undefined ? row.isDefault : req.body.isDefault,
    });

    if (row.isDefault) {
      await clearDefault(req.user!.id, row.id);
    }

    await addresses().save(row);
    return success(res, row);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to update address", 500);
  }
});

router.patch("/:id/default", authenticate, async (req: AuthRequest, res) => {
  try {
    const row = await addresses().findOne({
      where: { id: param(req.params.id), userId: req.user!.id },
    });

    if (!row) {
      return error(res, "Address not found", 404);
    }

    await clearDefault(req.user!.id, row.id);
    row.isDefault = true;
    await addresses().save(row);
    return success(res, row);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to set default address", 500);
  }
});

router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const row = await addresses().findOne({
      where: { id: param(req.params.id), userId: req.user!.id },
    });

    if (!row) {
      return error(res, "Address not found", 404);
    }

    const wasDefault = row.isDefault;
    await addresses().remove(row);

    if (wasDefault) {
      const next = await addresses().findOne({
        where: { userId: req.user!.id },
        order: { createdAt: "DESC" },
      });
      if (next) {
        next.isDefault = true;
        await addresses().save(next);
      }
    }

    return success(res, { message: "Address deleted" });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to delete address", 500);
  }
});

export default router;
