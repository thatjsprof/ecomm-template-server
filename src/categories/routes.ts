import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Category, Product } from "../entities";
import { success, error } from "../utils/response";
import { slugify, param } from "../utils/helpers";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import { createCategorySchema, updateCategorySchema } from "./schema";

const router = Router();
const categories = () => AppDataSource.getRepository(Category);
const products = () => AppDataSource.getRepository(Product);

router.get("/", async (_req, res) => {
  try {
    const items = await categories().find({
      order: { name: "ASC" },
      relations: { products: true },
    });

    const result = items.map(({ products: productList, ...category }) => ({
      ...category,
      _count: { products: productList.length },
    }));

    return success(res, result);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch categories", 500);
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const category = await categories().findOne({
      where: { slug: param(req.params.slug) },
    });

    if (!category) {
      return error(res, "Category not found", 404);
    }

    return success(res, category);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch category", 500);
  }
});

router.post(
  "/",
  authenticate,
  requireAdmin,
  validate(createCategorySchema),
  async (req, res) => {
    try {
      const { name, image } = req.body;
      let slug = slugify(name);

      const existing = await categories().findOne({ where: { slug } });
      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      const category = categories().create({ name, slug, image: image || null });
      await categories().save(category);

      return success(res, category, 201);
    } catch (err) {
      console.error(err);
      return error(res, "Failed to create category", 500);
    }
  }
);

router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validate(updateCategorySchema),
  async (req, res) => {
    try {
      const existing = await categories().findOne({ where: { id: param(req.params.id) } });
      if (!existing) {
        return error(res, "Category not found", 404);
      }

      const data: { name?: string; slug?: string; image?: string | null } = { ...req.body };

      if (data.name && data.name !== existing.name) {
        data.slug = slugify(data.name);
      }

      categories().merge(existing, data);
      await categories().save(existing);

      return success(res, existing);
    } catch (err) {
      console.error(err);
      return error(res, "Failed to update category", 500);
    }
  }
);

router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await categories().findOne({ where: { id: param(req.params.id) } });
    if (!existing) {
      return error(res, "Category not found", 404);
    }

    const productCount = await products().count({ where: { categoryId: existing.id } });
    if (productCount > 0) {
      return error(res, "Cannot delete category with products", 400);
    }

    await categories().remove(existing);

    return success(res, { message: "Category deleted" });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to delete category", 500);
  }
});

export default router;
