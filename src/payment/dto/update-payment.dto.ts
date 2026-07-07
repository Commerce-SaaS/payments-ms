import { IsUUID } from 'class-validator';

// Client-facing PATCH /payments/:id contract. Intentionally narrow: this
// endpoint only reassigns which payment method a payment is attributed to —
// amount, status, order, currency, etc. are not editable through it.
export class UpdatePaymentDto {
  @IsUUID()
  id: string;

  @IsUUID()
  organizationId: string;

  @IsUUID()
  paymentMethodId: string;
  
}
