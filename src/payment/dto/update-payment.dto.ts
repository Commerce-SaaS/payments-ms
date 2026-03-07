import {
  IsUUID,
  IsOptional,
  IsNumber,
  IsEnum,
  IsString,
  IsDate,
} from 'class-validator';
import { PaymentStatus } from '../enums/payment-status.enum';

export class UpdatePaymentDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsString()
  @IsOptional()
  externalPaymentId?: string;

  @IsString()
  @IsOptional()
  externalSessionId?: string;

  @IsString()
  @IsOptional()
  providerMetadata?: Record<string, any>;

  @IsString()
  @IsOptional()
  checkoutUrl?: string;

  @IsString()
  @IsOptional()
  failureReason?: string;

  @IsDate()
  @IsOptional()
  paidAt?: Date;
}
