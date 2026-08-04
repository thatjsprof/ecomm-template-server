import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { OrderStatus, PaymentStatus } from "./enums";
import { User } from "./User";
import { OrderItem } from "./OrderItem";

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", unique: true })
  orderNumber!: string;

  @Column({ type: "uuid", nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, (user) => user.orders, { nullable: true })
  @JoinColumn({ name: "userId" })
  user!: User | null;

  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.PENDING })
  status!: OrderStatus;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  subtotal!: string;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  shipping!: string;

  @Column({ type: "varchar", nullable: true })
  shippingMethod!: string | null;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  total!: string;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  discount!: string;

  @Column({ type: "varchar", nullable: true })
  couponCode!: string | null;

  @Column({ type: "varchar", nullable: true })
  paymentProvider!: string | null;

  @Column({ type: "varchar", unique: true, nullable: true })
  paymentReference!: string | null;

  @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Column({ type: "jsonb" })
  shippingAddress!: Record<string, string>;

  @Column({ type: "varchar" })
  customerEmail!: string;

  @Column({ type: "varchar" })
  customerName!: string;

  @Column({ type: "varchar" })
  customerPhone!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items!: OrderItem[];
}
