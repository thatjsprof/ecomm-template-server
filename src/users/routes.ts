import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Not } from "typeorm";
import { AppDataSource } from "../data-source";
import { User } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
const users = () => AppDataSource.getRepository(User);

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").min(2, "Name must be at least 2 characters").optional(),
  email: z.string().min(1, "Email is required").email("Invalid email").optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(1, "New password is required")
    .min(6, "Password must be at least 6 characters"),
});

router.get("/profile", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await users().findOne({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) {
      return error(res, "User not found", 404);
    }

    return success(res, user);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch profile", 500);
  }
});

router.put("/profile", authenticate, validate(updateProfileSchema), async (req: AuthRequest, res) => {
  try {
    if (req.body.email) {
      const existing = await users().findOne({
        where: { email: req.body.email, id: Not(req.user!.id) },
      });

      if (existing) {
        return error(res, "Email already in use", 409);
      }
    }

    const user = await users().findOne({ where: { id: req.user!.id } });
    if (!user) {
      return error(res, "User not found", 404);
    }

    users().merge(user, req.body);
    await users().save(user);

    return success(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to update profile", 500);
  }
});

router.put(
  "/password",
  authenticate,
  validate(changePasswordSchema),
  async (req: AuthRequest, res) => {
    try {
      const user = await users().findOne({ where: { id: req.user!.id } });
      if (!user) {
        return error(res, "User not found", 404);
      }

      const valid = await bcrypt.compare(req.body.currentPassword, user.password);
      if (!valid) {
        return error(res, "Current password is incorrect", 400);
      }

      user.password = await bcrypt.hash(req.body.newPassword, 10);
      await users().save(user);

      return success(res, { message: "Password updated" });
    } catch (err) {
      console.error(err);
      return error(res, "Failed to update password", 500);
    }
  }
);

export default router;
