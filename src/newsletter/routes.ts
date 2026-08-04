import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { Newsletter } from "../entities";
import { success, error } from "../utils/response";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import { param } from "../utils/helpers";

const router = Router();
const newsletters = () => AppDataSource.getRepository(Newsletter);

const subscribeSchema = z.object({
  email: z.string().email("Invalid email address"),
});

router.post("/subscribe", validate(subscribeSchema), async (req, res) => {
  try {
    const { email } = req.body;

    const existing = await newsletters().findOne({ where: { email } });
    if (existing) {
      return success(res, { message: "Already subscribed" });
    }

    await newsletters().save(newsletters().create({ email }));

    return success(res, { message: "Subscribed successfully" }, 201);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to subscribe", 500);
  }
});

router.get("/", authenticate, requireAdmin, async (_req, res) => {
  try {
    const subscribers = await newsletters().find({ order: { createdAt: "DESC" } });
    return success(res, subscribers);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch subscribers", 500);
  }
});

router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await newsletters().findOne({ where: { id: param(req.params.id) } });
    if (!existing) {
      return error(res, "Subscriber not found", 404);
    }

    await newsletters().remove(existing);

    return success(res, { message: "Subscriber removed" });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to remove subscriber", 500);
  }
});

export default router;
