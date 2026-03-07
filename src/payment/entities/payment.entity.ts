import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';

@Entity()
@Index(['orderId'])
@Index(['subscriptionId'])
@Index(['externalPaymentId'])
@Index(['externalSessionId'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

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

  // 🔹 ID del pago en el proveedor
  @Column({ nullable: true })
  externalPaymentId?: string;

  // 🔹 ID de sesión (si el proveedor usa sesiones)
  @Column({ nullable: true })
  externalSessionId?: string;

  // 🔹 Datos extra específicos del proveedor
  @Column({ type: 'json', nullable: true })
  providerMetadata?: Record<string, any>;

  @Column({ nullable: true })
  checkoutUrl?: string;

  @Column({ nullable: true })
  failureReason?: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
