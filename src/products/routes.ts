import { Router } from "express";
import { Not } from "typeorm";
import { AppDataSource } from "../data-source";
import { Product, ProductVariant } from "../entities";
import { success, error } from "../utils/response";
import { slugify, param } from "../utils/helpers";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from "./schema";

const router = Router();
const products = () => AppDataSource.getRepository(Product);
const variants = () => AppDataSource.getRepository(ProductVariant);

async function syncVariants(
  productId: string,
  incoming: Array<{
    id?: string;
    sku: string;
    attributes?: Record<string, string>;
    price?: number | null;
    salePrice?: number | null;
    stock?: number;
    active?: boolean;
  }>
) {
  const existing = await variants().find({ where: { productId } });
  const keepIds = incoming.filter((v) => v.id).map((v) => v.id as string);

  for (const old of existing) {
    if (!keepIds.includes(old.id)) {
      await variants().remove(old);
    }
  }

  for (const item of incoming) {
    if (item.id) {
      const current = existing.find((v) => v.id === item.id);
      if (!current) continue;

      current.sku = item.sku;
      current.attributes = item.attributes || {};
      current.price = item.price != null ? String(item.price) : null;
      current.salePrice = item.salePrice != null ? String(item.salePrice) : null;
      current.stock = item.stock ?? 0;
      current.active = item.active ?? true;
      await variants().save(current);
    } else {
      const created = variants().create({
        productId,
        sku: item.sku,
        attributes: item.attributes || {},
        price: item.price != null ? String(item.price) : null,
        salePrice: item.salePrice != null ? String(item.salePrice) : null,
        stock: item.stock ?? 0,
        active: item.active ?? true,
      });
      await variants().save(created);
    }
  }
}

router.get("/", validate(productQuerySchema, "query"), async (req, res) => {
  try {
    const { page, limit, search, category, sort, featured, newArrival } = req.query as unknown as {
      page: number;
      limit: number;
      search?: string;
      category?: string;
      sort: string;
      featured?: string;
      newArrival?: string;
    };

    const qb = products()
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.category", "category")
      .leftJoinAndSelect("product.variants", "variants")
      .where("product.active = :active", { active: true });

    if (search) {
      qb.distinct(true).andWhere(
        `(product.name ILIKE :search
          OR product.description ILIKE :search
          OR product.sku ILIKE :search
          OR variants.sku ILIKE :search)`,
        { search: `%${search}%` }
      );
    }

    if (category) {
      qb.andWhere("category.slug = :category", { category });
    }

    if (featured === "true") {
      qb.andWhere("product.featured = true");
    }

    if (newArrival === "true") {
      qb.andWhere("product.newArrival = true");
    }

    if (sort === "price-asc") {
      qb.orderBy("product.price", "ASC");
    } else if (sort === "price-desc") {
      qb.orderBy("product.price", "DESC");
    } else if (sort === "name") {
      qb.orderBy("product.name", "ASC");
    } else {
      qb.orderBy("product.createdAt", "DESC");
    }

    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return success(res, {
      products: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch products", 500);
  }
});

router.get("/admin/all", authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await products().findAndCount({
      relations: { category: true, variants: true },
      order: { createdAt: "DESC" },
      skip,
      take: limit,
    });

    return success(res, {
      products: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch products", 500);
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const product = await products().findOne({
      where: { slug: param(req.params.slug) },
      relations: { category: true, variants: true },
    });

    if (!product || !product.active) {
      return error(res, "Product not found", 404);
    }

    product.variants = (product.variants || []).filter((v) => v.active);

    const related = await products().find({
      where: {
        categoryId: product.categoryId,
        id: Not(product.id),
        active: true,
      },
      relations: { category: true, variants: true },
      take: 4,
    });

    return success(res, { product, related });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch product", 500);
  }
});

router.post(
  "/",
  authenticate,
  requireAdmin,
  validate(createProductSchema),
  async (req, res) => {
    try {
      const data = req.body;
      let slug = slugify(data.name);

      const existing = await products().findOne({ where: { slug } });
      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      const product = products().create({
        name: data.name,
        description: data.description,
        price: data.price,
        salePrice: data.salePrice ?? null,
        stock: data.stock,
        sku: data.sku,
        images: data.images || [],
        featured: data.featured,
        newArrival: data.newArrival,
        active: data.active,
        categoryId: data.categoryId,
        slug,
      });
      const savedProduct = await products().save(product);

      if (data.variants?.length) {
        await syncVariants(savedProduct.id, data.variants);
      }

      const saved = await products().findOne({
        where: { id: savedProduct.id },
        relations: { category: true, variants: true },
      });

      return success(res, saved, 201);
    } catch (err) {
      console.error(err);
      return error(res, "Failed to create product", 500);
    }
  }
);

router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validate(updateProductSchema),
  async (req, res) => {
    try {
      const existing = await products().findOne({ where: { id: param(req.params.id) } });
      if (!existing) {
        return error(res, "Product not found", 404);
      }

      const { variants: incomingVariants, ...data } = req.body;

      if (data.name && data.name !== existing.name) {
        data.slug = slugify(data.name);
      }

      products().merge(existing, data);
      await products().save(existing);

      if (incomingVariants) {
        await syncVariants(existing.id, incomingVariants);
      }

      const product = await products().findOne({
        where: { id: existing.id },
        relations: { category: true, variants: true },
      });

      return success(res, product);
    } catch (err) {
      console.error(err);
      return error(res, "Failed to update product", 500);
    }
  }
);

router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await products().findOne({ where: { id: param(req.params.id) } });
    if (!existing) {
      return error(res, "Product not found", 404);
    }

    await products().remove(existing);

    return success(res, { message: "Product deleted" });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to delete product", 500);
  }
});

export default router;
