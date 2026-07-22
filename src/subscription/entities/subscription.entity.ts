import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';

@Entity()
@Index(['userId'], { unique: true })
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // nullable so we can null it when the customer is anonymized.
  // PostgreSQL allows multiple NULLs in a unique index, so this is safe.
  // Requires a migration: ALTER TABLE subscription ALTER COLUMN user_id DROP NOT NULL;
  // type: 'varchar' is explicit because TypeORM cannot infer the column type from
  // the `string | null` union — without it the driver reports "Data type 'Object'".
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
  })
  plan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.PROCESSING,
  })
  status: SubscriptionStatus;

  @Column({ type: 'text', nullable: true })
  stripeSubscriptionId?: string;

  @Column({ type: 'timestamp', nullable: true })
  currentPeriodStart?: Date;

  @Column({ type: 'timestamp', nullable: true })
  currentPeriodEnd?: Date;

  @Column({ type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'int', nullable: true })
  priceAmount?: number;

  @Column({ nullable: true })
  currency?: string;

  @Column({ nullable: true })
  stripePriceId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
