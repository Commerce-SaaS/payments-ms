import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PaymentStatus } from '../../common/dto/payment-status.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentCancellationReason } from '../enums/payment-cancellation-reason.enum';

@Entity()
@Index(['orderId'])
@Index(['subscriptionId'])
@Index(['externalPaymentId'])
@Index(['externalSessionId'])
@Index(['organizationId', 'status'])
@Index(['organizationId', 'createdAt'])
@Index(['organizationId', 'provider'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  organizationId?: string;

  @Column({ nullable: true })
  orderId?: string;

  @Column({ nullable: true })
  subscriptionId?: string;

  // type: 'varchar' is explicit because TypeORM cannot infer the column type from
  // the `string | null` union — without it the driver reports "Data type 'Object'".
  @Column({ type: 'varchar', nullable: true })
  userId?: string | null;

  @Column({ type: 'int' })
  amount: number;

  @Column({ default: 'eur' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    nullable: true,
  })
  provider: PaymentProvider | null;

  @Column({ nullable: true })
  paymentMethodId?: string;

  @Column({ nullable: true })
  paymentMethodName?: string;

  @Column({ nullable: true })
  externalPaymentId?: string;

  @Column({ nullable: true })
  externalSessionId?: string;

  @Column({ type: 'json', nullable: true })
  providerMetadata?: Record<string, any> | null;

  @Column({ nullable: true })
  checkoutUrl?: string;

  @Column({
    type: 'enum',
    enum: PaymentCancellationReason,
    // enumName locks the Postgres type to the existing name so the prod migration
    // is only two ADD VALUE statements rather than a drop-and-recreate.
    enumName: 'payment_failurereason_enum',
    nullable: true,
  })
  failureReason?: PaymentCancellationReason;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
