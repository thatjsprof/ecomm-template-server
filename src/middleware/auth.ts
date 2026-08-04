import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { error } from "../utils/response";

export interface AuthUser {
  id: string;
  email: string;
  role: "ADMIN" | "CUSTOMER";
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return error(res, "Authentication required", 401);
  }

  const token = header.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return error(res, "Server configuration error", 500);
    }

    const decoded = jwt.verify(token, secret) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    return error(res, "Invalid or expired token", 401);
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next();
  }

  const token = header.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET;
    if (secret) {
      const decoded = jwt.verify(token, secret) as AuthUser;
      req.user = decoded;
    }
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return error(res, "Authentication required", 401);
  }

  if (req.user.role !== "ADMIN") {
    return error(res, "Admin access required", 403);
  }

  next();
}
