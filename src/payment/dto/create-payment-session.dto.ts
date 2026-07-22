import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { Type } from 'class-transformer';

export class ProductData {
  @IsString()
  name: string;
}

export class PriceData {
  @IsString()
  currency: string;

  @ValidateNested()
  @Type(() => ProductData)
  product_data: ProductData;

  @IsNumber()
  unit_amount: number;
}

export class LineItem {
  @ValidateNested()
  @Type(() => PriceData)
  price_data: PriceData;

  @IsNumber()
  quantity: number;
}

export class CreatePaymentSessionDto {
  @IsString()
  orderId: string;

  // Supplied by the caller (client-gateway resolves it from Order.cashSessionId)
  // — payments-ms does not resolve this itself, see the Payment entity comment.
  @IsOptional()
  @IsUUID()
  cashSessionId?: string;

  @IsString()
  userId: string;

  @IsNumber()
  amount: number;

  @IsString()
  provider: PaymentProvider;

  @IsString()
  organizationId: string;

  @IsString()
  stripeAccountId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItem)
  lineItems: LineItem[];
}