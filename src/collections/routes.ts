import { Router } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source";
import { Collection, Product } from "../entities";
import { success, error } from "../utils/response";
import { slugify, param } from "../utils/helpers";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import { createCollectionSchema, updateCollectionSchema } from "./schema";

const router = Router();
const collections = () => AppDataSource.getRepository(Collection);
const products = () => AppDataSource.getRepository(Product);

async function attachProducts(collection: Collection, productIds?: string[]) {
  if (productIds === undefined) return collection;
  if (productIds.length === 0) {
    collection.products = [];
    return collection;
  }
  collection.products = await products().find({
    where: { id: In(productIds), active: true },
  });
  return collection;
}

function serialize(collection: Collection) {
  const { products: productList, ...rest } = collection;
  return {
    ...rest,
    products: (productList || []).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      images: p.images,
      price: p.price,
      salePrice: p.salePrice,
      active: p.active,
    })),
    productIds: (productList || []).map((p) => p.id),
    _count: { products: (productList || []).length },
  };
}

router.get("/", async (req, res) => {
  try {
    const heroOnly = req.query.hero === "true";
    const items = await collections().find({
      where: {
        active: true,
        ...(heroOnly ? { showInHero: true } : {}),
      },
      order: { sortOrder: "ASC", name: "ASC" },
      relations: { products: true },
    });

    return success(
      res,
      items.map((item) => serialize(item))
    );
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch collections", 500);
  }
});

router.get("/admin/all", authenticate, requireAdmin, async (_req, res) => {
  try {
    const items = await collections().find({
      order: { sortOrder: "ASC", name: "ASC" },
      relations: { products: true },
    });
    return success(
      res,
      items.map((item) => serialize(item))
    );
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch collections", 500);
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const collection = await collections().findOne({
      where: { slug: param(req.params.slug), active: true },
      relations: {
        products: { category: true, variants: true },
      },
    });

    if (!collection) {
      return error(res, "Collection not found", 404);
    }

    const activeProducts = (collection.products || [])
      .filter((p) => p.active)
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    return success(res, {
      ...serialize({ ...collection, products: activeProducts }),
      products: activeProducts,
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch collection", 500);
  }
});

router.post(
  "/",
  authenticate,
  requireAdmin,
  validate(createCollectionSchema),
  async (req, res) => {
    try {
      const { name, description, image, active, showInHero, sortOrder, productIds } = req.body;
      let slug = slugify(name);
      const existing = await collections().findOne({ where: { slug } });
      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      const collection = collections().create({
        name,
        slug,
        description: description || null,
        image: image || null,
        active: active ?? true,
        showInHero: showInHero ?? false,
        sortOrder: sortOrder ?? 0,
      });

      await attachProducts(collection, productIds);
      await collections().save(collection);

      const saved = await collections().findOne({
        where: { id: collection.id },
        relations: { products: true },
      });

      return success(res, serialize(saved!), 201);
    } catch (err) {
      console.error(err);
      return error(res, "Failed to create collection", 500);
    }
  }
);

router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validate(updateCollectionSchema),
  async (req, res) => {
    try {
      const existing = await collections().findOne({
        where: { id: param(req.params.id) },
        relations: { products: true },
      });
      if (!existing) {
        return error(res, "Collection not found", 404);
      }

      const { name, description, image, active, showInHero, sortOrder, productIds } = req.body;

      if (name && name !== existing.name) {
        existing.name = name;
        existing.slug = slugify(name);
      }
      if (description !== undefined) existing.description = description;
      if (image !== undefined) existing.image = image;
      if (active !== undefined) existing.active = active;
      if (showInHero !== undefined) existing.showInHero = showInHero;
      if (sortOrder !== undefined) existing.sortOrder = sortOrder;

      await attachProducts(existing, productIds);
      await collections().save(existing);

      const saved = await collections().findOne({
        where: { id: existing.id },
        relations: { products: true },
      });

      return success(res, serialize(saved!));
    } catch (err) {
      console.error(err);
      return error(res, "Failed to update collection", 500);
    }
  }
);

router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await collections().findOne({
      where: { id: param(req.params.id) },
      relations: { products: true },
    });
    if (!existing) {
      return error(res, "Collection not found", 404);
    }

    existing.products = [];
    await collections().save(existing);
    await collections().remove(existing);

    return success(res, { message: "Collection deleted" });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to delete collection", 500);
  }
});

export default router;
