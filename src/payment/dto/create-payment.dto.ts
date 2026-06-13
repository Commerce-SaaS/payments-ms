import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsPositive,
  IsObject,
  IsUrl,
} from 'class-validator';
import { PaymentProvider } from '../enums/payment-provider.enum';

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
}
