import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaymentCancellationReason } from '../enums/payment-cancellation-reason.enum';

export class CancelPaymentDto {
  @IsUUID()
  id: string;

  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsEnum(PaymentCancellationReason)
  failureReason?: PaymentCancellationReason;
}
