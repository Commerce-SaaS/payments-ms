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
import { FailureReason } from '../enums/payment-failure-reason.enum';

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

  @Column({ nullable: true })
  userId?: string;

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
  })
  provider: PaymentProvider;

  @Column({ nullable: true })
  paymentMethodId?: string; 

  @Column({ nullable: true })
  paymentMethodName?: string;

  @Column({ nullable: true })
  externalPaymentId?: string;

  @Column({ nullable: true })
  externalSessionId?: string;

  @Column({ type: 'json', nullable: true })
  providerMetadata?: Record<string, any>;

  @Column({ nullable: true })
  checkoutUrl?: string;

  @Column({
    type: 'enum',
    enum: FailureReason,
    nullable: true,
  })
  failureReason?: FailureReason;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
