import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index(['organizationId'])
@Index(['organizationId', 'isActive'])
@Unique(['organizationId', 'name'])
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: false })
  isSystem: boolean;

  // Marks this method as "cash" for cash-session (ticket Z) reporting — used
  // by payment.totalsByMethod to compute CashSession.expectedCash. There is no
  // other reliable discriminator since `name` is free text per organization.
  @Column({ default: false })
  isCash: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @DeleteDateColumn()
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// PROD MIGRATION NOTE (TypeORM synchronize handles dev automatically; do NOT
// run synchronize in production):
//   ALTER TABLE "payment_method" ADD COLUMN "isCash" boolean NOT NULL DEFAULT false;
