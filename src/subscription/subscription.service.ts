import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Subscription } from './entities/subscription.entity';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { SubscriptionStatus } from './enums/subscription-status.enum';
import { SubscriptionErrorCode } from './enums/subscription-error-code.enum';

import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { PaymentType } from 'src/payment/enums/payment-type.enum';
import { envs } from 'src/config';
import { CreateSubscriptionSessionDto } from 'src/payment/dto/create-subscription-session.dto';
import { PaymentService } from 'src/payment/payment.service';
import { PaymentProviderFactory } from 'src/providers/payment-provider.factory';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,

    private readonly paymentService: PaymentService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  async createTrial(organizationId: string): Promise<Subscription> {
    const existing = await this.subscriptionRepository.findOneBy({
      organizationId,
    });

    if (existing) {
      RpcExceptionHelper.duplicate(
        SubscriptionErrorCode.SUBSCRIPTION_ALREADY_EXISTS,
        'Subscription',
      );
    }

    try {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 14);

      const subscription = this.subscriptionRepository.create({
        organizationId,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.TRIAL,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      });

      return await this.subscriptionRepository.save(subscription);
    } catch (error) {
      RpcExceptionHelper.internal(
        SubscriptionErrorCode.SUBSCRIPTION_CREATE_FAILED,
        'Failed to create trial subscription',
      );
    }
  }

  async createSubscriptionSession(dto: CreateSubscriptionSessionDto) {
    const { organizationId, priceId, subscriptionId, userId, provider } = dto;

    const existingPayment = await this.paymentService.getPendingPayment(
      { subscriptionId },
      provider,
    );

    if (existingPayment?.checkoutUrl) {
      return {
        paymentId: existingPayment.id,
        checkoutUrl: existingPayment.checkoutUrl,
      };
    }
    const providerStrategy = this.providerFactory.get(provider);
    const priceData = await providerStrategy.retrievePrice(priceId);

    if (!priceData.unitAmount) {
      RpcExceptionHelper.internal(
        SubscriptionErrorCode.SUBSCRIPTION_CREATE_FAILED,
        'Price data is invalid',
      );
    }

    const payment = await this.paymentService.create({
      organizationId,
      subscriptionId,
      provider,
      userId,
      amount: priceData.unitAmount,
      currency: priceData.currency,
    });

    const session = await providerStrategy.createSession({
      mode: 'subscription',
      lineItems: [{ price: priceId, quantity: 1 }],
      successUrl: `${envs.clientUrl}/success`,
      cancelUrl: `${envs.clientUrl}/cancel`,
      metadata: {
        subscriptionId,
        productId: priceData.productId,
        productName: priceData.productName,
        paymentId: payment.id,
        organizationId,
        type: PaymentType.SUBSCRIPTION,
      },
    });

    await this.paymentService.update(payment.id, {
      externalPaymentId: session.externalPaymentId ?? '',
      externalSessionId: session.externalSessionId ?? '',
      checkoutUrl: session.checkoutUrl,
      providerMetadata: session.raw ?? null,
    });

    return {
      paymentId: payment.id,
      checkoutUrl: session.checkoutUrl,
    };
  }

  async update(id: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.subscriptionRepository.findOneBy({
      id,
    });
    if (!subscription) {
      RpcExceptionHelper.notFound(
        SubscriptionErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription',
      );
    }

    Object.assign(subscription, dto);
    return await this.subscriptionRepository.save(subscription);
  }

  async getByOrganization(orgId: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOneBy({
      organizationId: orgId,
    });

    if (!subscription) {
      RpcExceptionHelper.notFound(
        SubscriptionErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription',
      );
    }

    return subscription;
  }

  async findOne(id: string) {
    const subscription = await this.subscriptionRepository.findOneBy({
      id
    });

    if (!subscription) {
      RpcExceptionHelper.notFound(
        SubscriptionErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription',
      );
    }

    return subscription;
  }

  async changePlan(id: string, plan: SubscriptionPlan): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOneBy({ id });

    if (!subscription) {
      RpcExceptionHelper.notFound(
        SubscriptionErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription',
      );
    }

    if (subscription.status === SubscriptionStatus.CANCELED) {
      RpcExceptionHelper.forbidden(
        SubscriptionErrorCode.SUBSCRIPTION_CANCELED,
        'Cannot change plan of a canceled subscription',
      );
    }

    subscription.plan = plan;
    return await this.subscriptionRepository.save(subscription);
  }

  async cancel(id: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOneBy({ id });

    if (!subscription) {
      RpcExceptionHelper.notFound(
        SubscriptionErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription',
      );
    }

    subscription.status = SubscriptionStatus.CANCELED;
    return await this.subscriptionRepository.save(subscription);
  }

  isActive(subscription: Subscription): boolean {
    const now = new Date();

    return (
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL].includes(
        subscription.status,
      ) && subscription.currentPeriodEnd != null && subscription.currentPeriodEnd > now
    );
  }
}
