import { IsEnum, IsUUID } from "class-validator";
import { SubscriptionPlan } from "../enums/subscription-plan.enum";

export class CreateSubscriptionDto {
  @IsUUID()
  organizationId: string;
}
