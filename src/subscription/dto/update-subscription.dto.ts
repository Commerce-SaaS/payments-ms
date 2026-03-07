import { PartialType } from '@nestjs/mapped-types';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import { IsEnum, IsOptional, IsDate, IsString } from 'class-validator';

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsString()
  @IsOptional()
  stripeSubscriptionId?: string | null;

  @IsOptional()
  @IsDate()
  currentPeriodStart?: Date;

  @IsOptional()
  @IsDate()
  currentPeriodEnd?: Date;
}
