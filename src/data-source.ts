import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";
import {
  User,
  Category,
  Product,
  ProductVariant,
  Order,
  OrderItem,
  CartItem,
  Coupon,
  Newsletter,
  Address,
  ShippingOption,
} from "./entities";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [
    User,
    Category,
    Product,
    ProductVariant,
    Order,
    OrderItem,
    CartItem,
    Coupon,
    Newsletter,
    Address,
    ShippingOption,
  ],
  synchronize: process.env.TYPEORM_SYNC !== "false",
  logging: process.env.TYPEORM_LOGGING === "true",
});
