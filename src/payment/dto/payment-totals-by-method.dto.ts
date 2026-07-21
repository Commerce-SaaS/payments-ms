import { IsUUID } from 'class-validator';

export class PaymentTotalsByMethodDto {
  @IsUUID()
  organizationId: string;

  // Filters payments by FK rather than a time range — organizationId is kept
  // as a defense-in-depth check (a cashSessionId from another org should
  // never match, but the query enforces it explicitly regardless).
  @IsUUID()
  cashSessionId: string;
}
