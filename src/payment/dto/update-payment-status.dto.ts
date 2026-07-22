import {
  IsUUID,
  IsOptional,
  IsNumber,
  IsEnum,
  IsString,
  IsDate,
} from 'class-validator';
import { PaymentStatus } from '../../common/dto/payment-status.enum';
import { PaymentCancellationReason } from '../enums/payment-cancellation-reason.enum';

// Internal DTO used by webhook/subscription handlers to transition a payment's
// lifecycle state. Not exposed over the gateway — see UpdatePaymentDto for the
// client-facing PATCH /payments/:id contract.
export class UpdatePaymentStatusDto {
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
  @IsEnum(PaymentCancellationReason)
  failureReason?: PaymentCancellationReason;

  @IsDate()
  @IsOptional()
  paidAt?: Date;
}
