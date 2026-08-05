import { Router } from "express";
import { In, Not } from "typeorm";
import { AppDataSource } from "../data-source";
import { Coupon, Order, OrderItem, Product, ProductVariant, Address, ShippingOption, OrderStatus, PaymentStatus } from "../entities";
import { success, error } from "../utils/response";
import { generateOrderNumber, param } from "../utils/helpers";
import { getVariantPrice } from "../utils/pricing";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin, optionalAuth, AuthRequest } from "../middleware/auth";
import { createOrderSchema, updateOrderStatusSchema } from "./schema";
import { notifyAdminNewOrder, notifyCustomerOrderStatus } from "../lib/email";

const router = Router();
const orders = () => AppDataSource.getRepository(Order);
const products = () => AppDataSource.getRepository(Product);
const variants = () => AppDataSource.getRepository(ProductVariant);
const coupons = () => AppDataSource.getRepository(Coupon);
const addresses = () => AppDataSource.getRepository(Address);
const shippingOptions = () => AppDataSource.getRepository(ShippingOption);

router.post(
  "/",
  optionalAuth,
  validate(createOrderSchema),
  async (req: AuthRequest, res) => {
    try {
      const {
        items,
        shippingAddress,
        paymentProvider,
        couponCode,
        shippingOptionId,
        saveAddress,
        addressLabel,
      } = req.body;

      const shippingOption = await shippingOptions().findOne({
        where: { id: shippingOptionId, active: true },
      });
      if (!shippingOption) {
        return error(res, "Invalid shipping option", 400);
      }
      const shipping = Number(shippingOption.price);

      const productIds = items.map((i: { productId: string }) => i.productId);
      const foundProducts = await products().find({
        where: { id: In(productIds), active: true },
        relations: { variants: true },
      });

      if (foundProducts.length !== productIds.length) {
        return error(res, "One or more products not found", 400);
      }

      let subtotal = 0;
      const orderItems: OrderItem[] = [];

      for (const item of items) {
        const product = foundProducts.find((p) => p.id === item.productId)!;
        const activeVariants = (product.variants || []).filter((v) => v.active);

        let variant: ProductVariant | null = null;

        if (activeVariants.length > 0) {
          if (!item.variantId) {
            return error(res, `Please select a variant for ${product.name}`, 400);
          }

          variant = activeVariants.find((v) => v.id === item.variantId) || null;
          if (!variant) {
            return error(res, `Invalid variant for ${product.name}`, 400);
          }

          if (variant.stock < item.quantity) {
            return error(res, `Insufficient stock for ${product.name}`, 400);
          }
        } else {
          if (product.stock < item.quantity) {
            return error(res, `Insufficient stock for ${product.name}`, 400);
          }
        }

        const price = getVariantPrice(product, variant);
        subtotal += price * item.quantity;

        const orderItem = new OrderItem();
        orderItem.productId = product.id;
        orderItem.variantId = variant?.id || null;
        orderItem.variantAttributes = variant?.attributes || null;
        orderItem.quantity = item.quantity;
        orderItem.price = String(price);
        orderItems.push(orderItem);
      }

      let discount = 0;

      if (couponCode) {
        const coupon = await coupons().findOne({
          where: { code: couponCode.toUpperCase() },
        });

        if (!coupon || !coupon.active || coupon.expiresAt < new Date()) {
          return error(res, "Invalid or expired coupon", 400);
        }

        discount = (subtotal * coupon.percentage) / 100;
      }

      const total = subtotal - discount + shipping;

      const order = orders().create({
        orderNumber: generateOrderNumber(),
        userId: req.user?.id || null,
        subtotal: String(subtotal),
        shipping: String(shipping),
        shippingMethod: shippingOption.name,
        discount: String(discount),
        total: String(total),
        couponCode: couponCode ? couponCode.toUpperCase() : null,
        paymentProvider,
        customerEmail: shippingAddress.email,
        customerName: shippingAddress.name,
        customerPhone: shippingAddress.phone,
        shippingAddress,
        items: orderItems,
      });

      await orders().save(order);

      if (req.user?.id && saveAddress) {
        const existing = await addresses().findOne({
          where: {
            userId: req.user.id,
            address: shippingAddress.address,
            city: shippingAddress.city,
            state: shippingAddress.state,
            country: shippingAddress.country,
            phone: shippingAddress.phone,
          },
        });

        if (!existing) {
          const count = await addresses().count({ where: { userId: req.user.id } });
          const created = addresses().create({
            userId: req.user.id,
            label: addressLabel || null,
            name: shippingAddress.name,
            phone: shippingAddress.phone,
            address: shippingAddress.address,
            city: shippingAddress.city,
            state: shippingAddress.state,
            country: shippingAddress.country,
            isDefault: count === 0,
          });
          await addresses().save(created);
        }
      }

      const saved = await orders().findOne({
        where: { id: order.id },
        relations: { items: { product: true, variant: true } },
      });

      if (saved) {
        void notifyAdminNewOrder(saved).catch((err) =>
          console.error("Failed to notify admin of new order:", err)
        );
      }

      return success(res, saved, 201);
    } catch (err) {
      console.error(err);
      return error(res, "Failed to create order", 500);
    }
  }
);

router.get("/my", authenticate, async (req: AuthRequest, res) => {
  try {
    const items = await orders().find({
      where: {
        userId: req.user!.id,
        status: Not(OrderStatus.PENDING),
      },
      order: { createdAt: "DESC" },
      relations: { items: { product: true, variant: true } },
    });

    return success(res, items);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch orders", 500);
  }
});

router.get("/my/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const order = await orders().findOne({
      where: { id: param(req.params.id), userId: req.user!.id },
      relations: { items: { product: true, variant: true } },
    });

    if (!order || order.status === OrderStatus.PENDING) {
      return error(res, "Order not found", 404);
    }

    return success(res, order);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch order", 500);
  }
});

router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const status = req.query.status as OrderStatus | undefined;
    const skip = (page - 1) * limit;

    const [items, total] = await orders().findAndCount({
      where: status ? { status } : {},
      skip,
      take: limit,
      order: { createdAt: "DESC" },
      relations: { items: { product: true, variant: true }, user: true },
    });

    return success(res, {
      orders: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch orders", 500);
  }
});

router.get("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const order = await orders().findOne({
      where: { id: param(req.params.id) },
      relations: { items: { product: true, variant: true }, user: true },
    });

    if (!order) {
      return error(res, "Order not found", 404);
    }

    return success(res, order);
  } catch (err) {
    console.error(err);
    return error(res, "Failed to fetch order", 500);
  }
});

router.patch(
  "/:id/status",
  authenticate,
  requireAdmin,
  validate(updateOrderStatusSchema),
  async (req, res) => {
    try {
      const existing = await orders().findOne({ where: { id: param(req.params.id) } });
      if (!existing) {
        return error(res, "Order not found", 404);
      }

      const previousStatus = existing.status;
      existing.status = req.body.status;
      await orders().save(existing);

      if (previousStatus !== existing.status) {
        void notifyCustomerOrderStatus(existing, previousStatus).catch((err) =>
          console.error("Failed to notify customer of order status:", err)
        );
      }

      return success(res, existing);
    } catch (err) {
      console.error(err);
      return error(res, "Failed to update order status", 500);
    }
  }
);

router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await orders().findOne({
      where: { id: param(req.params.id) },
      relations: { items: true },
    });

    if (!existing) {
      return error(res, "Order not found", 404);
    }

    await AppDataSource.transaction(async (manager) => {
      // Paid orders already reduced stock — put it back when removing the sale.
      if (existing.paymentStatus === PaymentStatus.SUCCESS) {
        for (const item of existing.items || []) {
          if (item.variantId) {
            await manager.increment(ProductVariant, { id: item.variantId }, "stock", item.quantity);
          } else {
            await manager.increment(Product, { id: item.productId }, "stock", item.quantity);
          }
        }
      }

      await manager.remove(existing);
    });

    return success(res, { id: existing.id });
  } catch (err) {
    console.error(err);
    return error(res, "Failed to delete order", 500);
  }
});

export default router;
