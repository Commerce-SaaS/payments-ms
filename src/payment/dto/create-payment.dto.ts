import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsPositive,
  IsObject,
  IsUrl,
  IsDateString,
} from 'class-validator';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentStatus } from '../../common/dto/payment-status.enum';

export class CreatePaymentDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  // Supplied by the caller (client-gateway resolves it from Order.cashSessionId)
  // — payments-ms does not resolve this itself, see the entity comment.
  @IsOptional()
  @IsUUID()
  cashSessionId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  paymentMethodName?: string;

  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @IsOptional()
  @IsString()
  externalPaymentId?: string;

  @IsOptional()
  @IsString()
  externalSessionId?: string;

  @IsOptional()
  @IsObject()
  providerMetadata?: Record<string, any>;

  @IsOptional()
  @IsUrl()
  checkoutUrl?: string;

  // Optional — omitted for async flows (Stripe checkout via
  // createPaymentSession, subscriptions) which stay PENDING until the
  // provider webhook/updateStatus() confirms them. A synchronous payment
  // (e.g. cash, settled the instant staff registers it) can set both here so
  // it never has to pass through PENDING.
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
