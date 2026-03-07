import { IsNumber, IsString, IsUUID } from 'class-validator';
import { PaymentProvider } from '../enums/payment-provider.enum';

export class CreateSubscriptionSessionDto {
  @IsUUID()
  subscriptionId: string;

  @IsUUID()
  organizationId: string;

  @IsString()
  priceId: string;

  @IsUUID()
  userId: string;

  @IsString()
  provider: PaymentProvider;
}
