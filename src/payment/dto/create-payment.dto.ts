import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsPositive,
  IsObject,
  IsUrl,
  IsCurrency,
} from 'class-validator';
import { PaymentProvider } from '../enums/payment-provider.enum';

export class CreatePaymentDto {
  @IsUUID()
  organizationId: string;

  // Puede ser pago de order o de subscription
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(PaymentProvider)
  provider: PaymentProvider;

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
}