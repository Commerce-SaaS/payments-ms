import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SubscriptionService } from './subscription.service';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { SUBSCRIPTION_PATTERNS } from './patterns/suscription_patterns';
import { CreateOnboardingSubscriptionSessionDto } from './dto/create-onboarding-subscription-session.dto';

@Controller()
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @MessagePattern(SUBSCRIPTION_PATTERNS.GET_BY_USER)
  getByUser(@Payload() data: { userId: string }) {
    return this.service.getByUser(data.userId);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.GET_MY_HISTORY)
  getMyHistory(@Payload() data: { userId: string }) {
    return this.service.getMyHistory(data.userId);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.GET_MY_BY_ID)
  getMyById(@Payload() data: { id: string; userId: string }) {
    return this.service.getMyById(data.id, data.userId);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CREATE_ONBOARDING_SUBSCRIPTION_SESSION)
  async createOnboardingSubscriptionSession(
    @Payload() data: CreateOnboardingSubscriptionSessionDto,
  ) {
    return this.service.createOnboardingSubscriptionSession(data);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CHANGE_PLAN)
  changePlan(@Payload() data: { id: string; plan: SubscriptionPlan }) {
    return this.service.changePlan(data.id, data.plan);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CANCEL)
  cancel(@Payload() data: { id: string }) {
    return this.service.cancel(data.id);
  }
}
