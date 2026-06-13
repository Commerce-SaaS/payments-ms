import { IsEnum, IsString, IsUUID } from 'class-validator';
import { FailureReason } from '../enums/payment-failure-reason.enum';

export class CancelPaymentDto {
  @IsUUID()
  id: string;

  @IsUUID()
  organizationId: string;

  @IsEnum(FailureReason)
  failureReason: FailureReason;
}
