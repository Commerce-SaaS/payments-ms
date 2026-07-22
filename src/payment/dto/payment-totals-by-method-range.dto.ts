import { IsISO8601, IsUUID } from 'class-validator';

export class PaymentTotalsByMethodRangeDto {
  @IsUUID()
  organizationId: string;

  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;
}
