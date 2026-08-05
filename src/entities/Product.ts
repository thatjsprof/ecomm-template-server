import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Category } from "./Category";
import { OrderItem } from "./OrderItem";
import { ProductVariant } from "./ProductVariant";

@Entity("products")
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", unique: true })
  slug!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price!: string;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  salePrice!: string | null;

  @Column({ type: "int", default: 0 })
  stock!: number;

  @Column({ type: "varchar", unique: true })
  sku!: string;

  @Column("text", { array: true, default: () => "'{}'" })
  images!: string[];

  /**
   * Option definitions for the admin matrix / storefront selectors.
   * e.g. [{ name: "Color", values: [{ value: "Black", image: "https://..." }] }]
   */
  @Column({ type: "jsonb", nullable: true })
  optionConfig!: Array<{
    name: string;
    values: Array<{ value: string; image?: string | null }>;
  }> | null;

  @Column({ type: "boolean", default: false })
  featured!: boolean;

  @Column({ type: "boolean", default: false })
  newArrival!: boolean;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @Column({ type: "uuid" })
  categoryId!: string;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: "categoryId" })
  category!: Category;

  @OneToMany(() => ProductVariant, (variant) => variant.product, { cascade: true })
  variants!: ProductVariant[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => OrderItem, (item) => item.product)
  orderItems!: OrderItem[];
}
