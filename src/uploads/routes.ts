import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate, requireAdmin } from "../middleware/auth";
import { success, error } from "../utils/response";
import { siteConfig } from "../config/site";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext)) {
      cb(new Error("Only image files are allowed"));
      return;
    }

    cb(null, true);
  },
});

router.post("/", authenticate, requireAdmin, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return error(res, err.message || "Upload failed", 400);
    }

    if (!req.file) {
      return error(res, "No image provided", 400);
    }

    const appUrl = siteConfig.appUrl;
    const url = `${appUrl}/uploads/${req.file.filename}`;

    return success(res, { url, filename: req.file.filename }, 201);
  });
});

router.post("/multiple", authenticate, requireAdmin, (req, res) => {
  upload.array("images", 10)(req, res, (err) => {
    if (err) {
      return error(res, err.message || "Upload failed", 400);
    }

    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return error(res, "No images provided", 400);
    }

    const appUrl = siteConfig.appUrl;
    const urls = files.map((file) => ({
      url: `${appUrl}/uploads/${file.filename}`,
      filename: file.filename,
    }));

    return success(res, urls, 201);
  });
});

export default router;
