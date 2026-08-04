import "reflect-metadata";
import bcrypt from "bcryptjs";
import { AppDataSource } from "./data-source";
import { siteConfig } from "./config/site";
import { Category, Product, ProductVariant, Role, User, ShippingOption } from "./entities";

async function main() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const shippingRepo = AppDataSource.getRepository(ShippingOption);

  const { adminEmail, adminPassword, adminName } = siteConfig.seed;

  let admin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!admin) {
    admin = userRepo.create({
      name: adminName,
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      role: Role.ADMIN,
    });
    await userRepo.save(admin);
  }

  console.log("Admin user:", admin.email);

  const shippingCount = await shippingRepo.count();
  if (shippingCount === 0) {
    await shippingRepo.save(
      siteConfig.defaultShippingOptions.map((option, index) =>
        shippingRepo.create({
          name: option.name,
          description: option.description,
          price: String(option.price),
          active: true,
          sortOrder: index,
        })
      )
    );
    console.log("Shipping options seeded");
  }

  const categoryData = [
    { name: "Clothing", slug: "clothing" },
    { name: "Accessories", slug: "accessories" },
    { name: "Footwear", slug: "footwear" },
  ];

  const categories: Category[] = [];

  for (const item of categoryData) {
    let category = await categoryRepo.findOne({ where: { slug: item.slug } });
    if (!category) {
      category = categoryRepo.create({ ...item, image: null });
      await categoryRepo.save(category);
    }
    categories.push(category);
  }

  console.log("Categories:", categories.map((c) => c.name).join(", "));

  const existingProducts = await productRepo.count();

  if (existingProducts === 0) {
    const samples = [
      {
        name: "Linen Oversized Shirt",
        slug: "linen-oversized-shirt",
        description:
          "A softly structured oversized shirt cut from breathable linen. Designed for everyday ease with clean lines and a relaxed fit.",
        price: "12000",
        salePrice: "9800",
        stock: 50,
        sku: "CLO-001",
        images: [],
        featured: true,
        newArrival: true,
        categoryId: categories[0].id,
      },
      {
        name: "Wool Blend Coat",
        slug: "wool-blend-coat",
        description:
          "A minimal wool-blend coat with a tailored silhouette. Perfect for transitional weather with understated elegance.",
        price: "45000",
        salePrice: null,
        stock: 20,
        sku: "CLO-002",
        images: [],
        featured: true,
        newArrival: false,
        categoryId: categories[0].id,
      },
      {
        name: "Leather Crossbody Bag",
        slug: "leather-crossbody-bag",
        description:
          "Hand-finished leather crossbody with an adjustable strap. Compact, durable, and refined.",
        price: "28000",
        salePrice: "24000",
        stock: 35,
        sku: "ACC-001",
        images: [],
        featured: true,
        newArrival: true,
        categoryId: categories[1].id,
      },
      {
        name: "Minimalist Watch",
        slug: "minimalist-watch",
        description:
          "A clean dial and slim case define this everyday watch. Stainless steel with a soft leather strap.",
        price: "35000",
        salePrice: null,
        stock: 15,
        sku: "ACC-002",
        images: [],
        featured: false,
        newArrival: true,
        categoryId: categories[1].id,
      },
      {
        name: "Suede Loafers",
        slug: "suede-loafers",
        description:
          "Soft suede loafers with a flexible sole. Crafted for comfort without compromising on form.",
        price: "32000",
        salePrice: "28000",
        stock: 25,
        sku: "FTW-001",
        images: [],
        featured: true,
        newArrival: false,
        categoryId: categories[2].id,
      },
      {
        name: "Canvas Sneakers",
        slug: "canvas-sneakers",
        description:
          "Lightweight canvas sneakers with a clean white sole. An everyday essential in a refined silhouette.",
        price: "18000",
        salePrice: null,
        stock: 40,
        sku: "FTW-002",
        images: [],
        featured: false,
        newArrival: true,
        categoryId: categories[2].id,
      },
    ];

    await productRepo.save(samples.map((item) => productRepo.create(item)));
    console.log("Sample products created");
  }

  const variantRepo = AppDataSource.getRepository(ProductVariant);
  const shirt = await productRepo.findOne({ where: { slug: "linen-oversized-shirt" } });
  const loafers = await productRepo.findOne({ where: { slug: "suede-loafers" } });

  if (shirt) {
    const count = await variantRepo.count({ where: { productId: shirt.id } });
    if (count === 0) {
      await variantRepo.save([
        variantRepo.create({
          productId: shirt.id,
          sku: "CLO-001-S-WHT",
          attributes: { Size: "S", Color: "White" },
          stock: 10,
          price: null,
          salePrice: null,
        }),
        variantRepo.create({
          productId: shirt.id,
          sku: "CLO-001-M-WHT",
          attributes: { Size: "M", Color: "White" },
          stock: 15,
          price: null,
          salePrice: null,
        }),
        variantRepo.create({
          productId: shirt.id,
          sku: "CLO-001-L-BLK",
          attributes: { Size: "L", Color: "Black" },
          stock: 12,
          price: null,
          salePrice: "9500",
        }),
      ]);
      console.log("Shirt variants created");
    }
  }

  if (loafers) {
    const count = await variantRepo.count({ where: { productId: loafers.id } });
    if (count === 0) {
      await variantRepo.save([
        variantRepo.create({
          productId: loafers.id,
          sku: "FTW-001-40-TAN",
          attributes: { Size: "40", Color: "Tan" },
          stock: 8,
          price: null,
          salePrice: null,
        }),
        variantRepo.create({
          productId: loafers.id,
          sku: "FTW-001-42-TAN",
          attributes: { Size: "42", Color: "Tan" },
          stock: 10,
          price: null,
          salePrice: null,
        }),
        variantRepo.create({
          productId: loafers.id,
          sku: "FTW-001-42-BLK",
          attributes: { Size: "42", Color: "Black" },
          stock: 7,
          price: "30000",
          salePrice: null,
        }),
      ]);
      console.log("Loafer variants created");
    }
  }

  console.log("Seed complete");
  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});
