import {
  IsUUID,
  IsOptional,
  IsNumber,
  IsEnum,
  IsString,
  IsDate,
} from 'class-validator';
import { PaymentStatus } from '../../common/dto/payment-status.enum';
import { FailureReason } from '../enums/payment-failure-reason.enum';

export class UpdatePaymentDto {
  @IsString()
  paymentId: string;

  
  @IsOptional()
  @IsString()
  organizationId?: string;

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

  @IsOptional()
  @IsEnum(FailureReason)
  failureReason?: FailureReason;

  @IsDate()
  @IsOptional()
  paidAt?: Date;
}
