import { Controller } from '@nestjs/common';
import { MessagePattern, EventPattern } from '@nestjs/microservices';
import { SubscriptionService } from './subscription.service';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { SUBSCRIPTION_PATTERNS } from './patterns/suscription_patterns';
import { CreateSubscriptionSessionDto } from 'src/payment/dto/create-subscription-session.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Controller()
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @EventPattern(SUBSCRIPTION_PATTERNS.CREATE_TRIAL)
  createTrial(data: CreateSubscriptionDto) {
    this.service.createTrial(data.organizationId);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CREATE_SUBSCRIPTION_SESSION)
  async createSubscriptionSession(data: CreateSubscriptionSessionDto) {
    return this.service.createSubscriptionSession(data);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.GET_BY_ORG)
  getByOrg(data: CreateSubscriptionDto) {
    return this.service.getByOrganization(data.organizationId);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CHANGE_PLAN)
  changePlan(data: { id: string; plan: SubscriptionPlan }) {
    return this.service.changePlan(data.id, data.plan);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CANCEL)
  cancel(data: { id: string }) {
    return this.service.cancel(data.id);
  }
}
