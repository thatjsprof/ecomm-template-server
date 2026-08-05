import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from "typeorm";
import { Product } from "./Product";

@Entity("collections")
export class Collection {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  /** Hero / card image for the collection */
  @Column({ type: "varchar", nullable: true })
  image!: string | null;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  /** Include in the home collection slideshow hero */
  @Column({ type: "boolean", default: false })
  showInHero!: boolean;

  /** Hero CTA button label */
  @Column({ type: "varchar", default: "Shop Now" })
  ctaLabel!: string;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  @ManyToMany(() => Product, (product) => product.collections, { cascade: false })
  @JoinTable({
    name: "collection_products",
    joinColumn: { name: "collectionId", referencedColumnName: "id" },
    inverseJoinColumn: { name: "productId", referencedColumnName: "id" },
  })
  products!: Product[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
