import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { MoreThan } from "typeorm";
import { AppDataSource } from "../data-source";
import { User } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./schema";
import { siteConfig } from "../config/site";

const router = Router();
const users = () => AppDataSource.getRepository(User);

function createToken(user: { id: string; email: string; role: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: "7d" }
  );
}

router.post("/register", validate(registerSchema), async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await users().findOne({ where: { email } });
    if (existing) {
      return error(res, "Email already registered", 409);
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = users().create({ name, email, password: hashed });
    await users().save(user);

    const token = createToken(user);

    return success(
      res,
      {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        token,
      },
      201
    );
  } catch (err) {
    console.error(err);
    return error(res, "Registration failed", 500);
  }
});

router.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await users().findOne({ where: { email } });
    if (!user) {
      return error(res, "Invalid email or password", 401);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return error(res, "Invalid email or password", 401);
    }

    const token = createToken(user);

    return success(res, {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    console.error(err);
    return error(res, "Login failed", 500);
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
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
    return error(res, "Failed to get user", 500);
  }
});

router.post("/forgot-password", validate(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await users().findOne({ where: { email } });

    if (!user) {
      return success(res, { message: "If that email exists, a reset link has been sent" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await users().save(user);

    const frontendUrl = siteConfig.frontendUrl;
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    console.log(`Password reset link for ${email}: ${resetUrl}`);

    return success(res, {
      message: "If that email exists, a reset link has been sent",
      ...(process.env.NODE_ENV !== "production" ? { resetToken, resetUrl } : {}),
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to process request", 500);
  }
});

router.post("/reset-password", validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await users().findOne({
      where: {
        resetToken: token,
        resetTokenExpiry: MoreThan(new Date()),
      },
    });

    if (!user) {
      return error(res, "Invalid or expired reset token", 400);
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await users().save(user);

    return success(res, { message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to reset password", 500);
  }
});

export default router;
