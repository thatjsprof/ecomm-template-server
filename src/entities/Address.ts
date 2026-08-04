import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";

@Entity("addresses")
export class Address {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "varchar", nullable: true })
  label!: string | null;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar" })
  phone!: string;

  @Column({ type: "varchar" })
  address!: string;

  @Column({ type: "varchar" })
  city!: string;

  @Column({ type: "varchar" })
  state!: string;

  @Column({ type: "varchar" })
  country!: string;

  @Column({ type: "boolean", default: false })
  isDefault!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
