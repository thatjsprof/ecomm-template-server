import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { Role } from "./enums";
import { Order } from "./Order";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", unique: true })
  email!: string;

  @Column({ type: "varchar" })
  password!: string;

  @Column({ type: "enum", enum: Role, default: Role.CUSTOMER })
  role!: Role;

  @Column({ type: "varchar", nullable: true })
  resetToken!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  resetTokenExpiry!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @OneToMany(() => Order, (order) => order.user)
  orders!: Order[];
}
