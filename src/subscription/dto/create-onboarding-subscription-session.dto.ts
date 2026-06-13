import { IsEnum, IsString, IsUUID } from 'class-validator';
import { PaymentProvider } from 'src/payment/enums/payment-provider.enum';

export class CreateOnboardingSubscriptionSessionDto {
  @IsUUID()
  userId: string;

  @IsString()
  priceId: string;

  @IsEnum(PaymentProvider)
  provider: PaymentProvider;
}
