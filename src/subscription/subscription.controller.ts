import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { SubscriptionService } from './subscription.service';
import { PaymentService } from 'src/payment/payment.service';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { SUBSCRIPTION_PATTERNS } from './patterns/suscription_patterns';
import { CreateOnboardingSubscriptionSessionDto } from './dto/create-onboarding-subscription-session.dto';

@Controller()
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private readonly service: SubscriptionService,
    private readonly paymentService: PaymentService,
  ) {}

  @MessagePattern(SUBSCRIPTION_PATTERNS.GET_PLANS)
  getPlans() {
    return this.service.getPlans();
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.GET_BY_USER)
  getByUser(@Payload() data: { userId: string }) {
    return this.service.getByUser(data.userId);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.GET_MY_HISTORY)
  getMyHistory(@Payload() data: { userId: string }) {
    return this.service.getMyInvoiceHistory(data.userId);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CREATE_ONBOARDING_SUBSCRIPTION_SESSION)
  async createOnboardingSubscriptionSession(
    @Payload() data: CreateOnboardingSubscriptionSessionDto,
  ) {
    return this.service.createOnboardingSubscriptionSession(data);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CHANGE_PLAN)
  changePlan(
    @Payload() data: { id: string; userId: string; plan: SubscriptionPlan },
  ) {
    return this.service.changePlan(data.id, data.userId, data.plan);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CANCEL)
  cancel(@Payload() data: { id: string; userId: string }) {
    return this.service.cancel(data.id, data.userId);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.RESUME)
  resume(@Payload() data: { id: string; userId: string }) {
    return this.service.resume(data.id, data.userId);
  }

  // Received from auth-ms after a customer is anonymized.
  // Handles both Payment and Subscription tables in one handler since
  // SubscriptionModule already imports the global PaymentModule.
  @EventPattern(SUBSCRIPTION_PATTERNS.CUSTOMER_ANONYMIZED)
  async onCustomerAnonymized(@Payload() data: { userId: string }) {
    try {
      await Promise.all([
        this.service.anonymizeCustomerSubscription(data.userId),
        this.paymentService.anonymizeCustomerPayments(data.userId),
      ]);
    } catch (error) {
      // Log and swallow — a failure here must not crash the RabbitMQ consumer.
      this.logger.error(
        `customer.anonymized: failed for userId=${data.userId}: ${error?.message}`,
      );
    }
  }
}
