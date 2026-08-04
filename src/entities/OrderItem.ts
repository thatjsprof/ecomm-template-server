import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Order } from "./Order";
import { Product } from "./Product";
import { ProductVariant } from "./ProductVariant";

@Entity("order_items")
export class OrderItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "orderId" })
  order!: Order;

  @Column({ type: "uuid" })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.orderItems)
  @JoinColumn({ name: "productId" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variantId!: string | null;

  @ManyToOne(() => ProductVariant, (variant) => variant.orderItems, { nullable: true })
  @JoinColumn({ name: "variantId" })
  variant!: ProductVariant | null;

  // Snapshot of selected attributes at purchase time
  @Column({ type: "jsonb", nullable: true })
  variantAttributes!: Record<string, string> | null;

  @Column({ type: "int" })
  quantity!: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price!: string;
}
