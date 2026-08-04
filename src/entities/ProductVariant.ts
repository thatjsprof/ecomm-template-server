import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Product } from "./Product";
import { OrderItem } from "./OrderItem";

@Entity("product_variants")
export class ProductVariant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "productId" })
  product!: Product;

  @Column({ type: "varchar", unique: true })
  sku!: string;

  // e.g. { "Size": "M", "Color": "Black" }
  @Column({ type: "jsonb", default: {} })
  attributes!: Record<string, string>;

  // null = use parent product price
  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  price!: string | null;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  salePrice!: string | null;

  @Column({ type: "int", default: 0 })
  stock!: number;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => OrderItem, (item) => item.variant)
  orderItems!: OrderItem[];
}
