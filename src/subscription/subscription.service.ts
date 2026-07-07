import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import Stripe from 'stripe';

import { Subscription } from './entities/subscription.entity';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { SubscriptionStatus } from './enums/subscription-status.enum';
import { SubscriptionErrorCode } from './enums/subscription-error-code.enum';

import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { PaymentType } from 'src/payment/enums/payment-type.enum';
import { envs } from 'src/config';
import { STRIPE_CLIENT } from 'src/config/services';
import { CreateOnboardingSubscriptionSessionDto } from './dto/create-onboarding-subscription-session.dto';
import { PaymentService } from 'src/payment/payment.service';
import { PaymentProviderFactory } from 'src/providers/payment-provider.factory';
import { InvoiceHistoryItemDto } from './dto/invoice-history-items.dto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,

    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe,

    private readonly paymentService: PaymentService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  private readonly PLAN_RANK: Record<SubscriptionPlan, number> = {
    [SubscriptionPlan.BASIC]: 1,
    [SubscriptionPlan.PRO]: 2,
  };

  async createOnboardingSubscriptionSession(
    dto: CreateOnboardingSubscriptionSessionDto,
  ) {
    const { userId, priceId, provider } = dto;

    let subscription = await this.subscriptionRepository.findOneBy({ userId });

    if (!subscription) {
      try {
        subscription = await this.subscriptionRepository.save(
          this.subscriptionRepository.create({
            userId,
            plan: SubscriptionPlan.BASIC,
            status: SubscriptionStatus.PROCESSING,
          }),
        );
      } catch (error) {
        if ((error as any)?.code === '23505') {
          subscription = await this.subscriptionRepository.findOneBy({
            userId,
          });
        } else {
          throw error;
        }
      }
    }

    if (this.isActive(subscription!)) {
      return {
        subscriptionId: subscription!.id,
        alreadyActive: true,
      };
    }

    const existingPayment = await this.paymentService.getPendingPayment(
      { subscriptionId: subscription!.id },
      provider,
    );

    if (existingPayment?.checkoutUrl) {
      return {
        paymentId: existingPayment.id,
        checkoutUrl: existingPayment.checkoutUrl,
      };
    }

    if (subscription!.status !== SubscriptionStatus.PROCESSING) {
      subscription!.status = SubscriptionStatus.PROCESSING;
      subscription!.cancelAtPeriodEnd = false;
      subscription!.stripeSubscriptionId = null as any;
      await this.subscriptionRepository.save(subscription!);
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
      subscriptionId: subscription!.id,
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
        subscriptionId: subscription!.id,
        productId: priceData.productId,
        productName: priceData.productName,
        paymentId: payment.id,
        userId,
        type: PaymentType.SUBSCRIPTION,
      },
    });

    await this.paymentService.updateStatus({
      paymentId: payment.id,
      externalSessionId: session.externalSessionId ?? '',
      checkoutUrl: session.checkoutUrl,
      providerMetadata: session.raw ?? null,
    });

    return {
      paymentId: payment.id,
      checkoutUrl: session.checkoutUrl,
    };
  }

  async getPlans() {
    const ids = [envs.stripePriceIdBasic, envs.stripePriceIdPro];
    const prices = await Promise.all(
      ids.map((id) => this.stripe.prices.retrieve(id, { expand: ['product'] })),
    );

    return prices.map((price) => ({
      plan: price.id === envs.stripePriceIdPro ? 'PRO' : 'BASIC',
      priceId: price.id,
      amount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    }));
  }

  async getMyInvoiceHistory(userId: string): Promise<InvoiceHistoryItemDto[]> {
    const subscription = await this.subscriptionRepository.findOneBy({
      userId,
    });

    if (!subscription?.stripeSubscriptionId) {
      return [];
    }

    let invoices: Stripe.ApiList<Stripe.Invoice>;
    try {
      invoices = await this.stripe.invoices.list({
        subscription: subscription.stripeSubscriptionId,
        limit: 24,
      });
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === 'resource_missing'
      ) {
        console.warn(
          `Stripe subscription ${subscription.stripeSubscriptionId} not found; returning empty history`,
        );
        return [];
      }
      RpcExceptionHelper.handle(error);
    }

    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? null,
      status: inv.status ?? null,
      amountPaid: inv.amount_paid,
      amountDue: inv.amount_due,
      currency: inv.currency,
      created: inv.created * 1000,
      periodStart: inv.period_start * 1000,
      periodEnd: inv.period_end * 1000,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
    }));
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

  async getByUser(userId: string): Promise<Subscription> {
    return await this.findOneOrThrow({ userId });
  }

  async findOne(id: string): Promise<Subscription> {
    return await this.findOneOrThrow({ id });
  }

  async changePlan(
    id: string,
    userId: string,
    plan: SubscriptionPlan,
  ): Promise<Subscription> {
    const subscription = await this.findOneOrThrow({ id, userId });

    if (subscription.status === SubscriptionStatus.CANCELED) {
      RpcExceptionHelper.forbidden(
        SubscriptionErrorCode.SUBSCRIPTION_CANCELED,
        'Cannot change plan of a canceled subscription',
      );
    }

    if (subscription.plan === plan) return subscription;

    if (!subscription.stripeSubscriptionId) {
      subscription.plan = plan;
      return this.subscriptionRepository.save(subscription);
    }

    const newPriceId =
      plan === SubscriptionPlan.PRO
        ? envs.stripePriceIdPro
        : envs.stripePriceIdBasic;

    if (!newPriceId) {
      RpcExceptionHelper.internal(
        SubscriptionErrorCode.SUBSCRIPTION_CREATE_FAILED,
        `Price ID for plan ${plan} is not configured`,
      );
    }

    const isUpgrade = this.PLAN_RANK[plan] > this.PLAN_RANK[subscription.plan];

    if (isUpgrade) {
      // UPGRADE
      await this.applyImmediateUpgrade(
        subscription.stripeSubscriptionId,
        newPriceId,
      );
    } else {
      // DOWNGRADE
      await this.scheduleDowngradeAtPeriodEnd(
        subscription.stripeSubscriptionId,
        newPriceId,
      );
    }
    return subscription;
  }

  async cancel(id: string, userId: string): Promise<Subscription> {
    const subscription = await this.findOneOrThrow({ id, userId });

    if (subscription.status === SubscriptionStatus.CANCELED) {
      return subscription;
    }

    if (subscription.stripeSubscriptionId) {
      await this.releaseScheduleIfAny(subscription.stripeSubscriptionId);
      await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        },
      );
      subscription.cancelAtPeriodEnd = true;
    } else {
      subscription.status = SubscriptionStatus.CANCELED;
    }

    return this.subscriptionRepository.save(subscription);
  }

  async resume(id: string, userId: string): Promise<Subscription> {
    const subscription = await this.findOneOrThrow({ id, userId });

    // Ya cancelada del todo (pasó el período) → no se puede reanudar, hay que re-suscribir
    if (subscription.status === SubscriptionStatus.CANCELED) {
      RpcExceptionHelper.forbidden(
        SubscriptionErrorCode.SUBSCRIPTION_CANCELED,
        'Cannot resume a canceled subscription; create a new one',
      );
    }

    // No hay cancelación pendiente que deshacer
    if (!subscription.stripeSubscriptionId || !subscription.cancelAtPeriodEnd) {
      return subscription;
    }
    await this.releaseScheduleIfAny(subscription.stripeSubscriptionId);
    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    subscription.cancelAtPeriodEnd = false;
    return this.subscriptionRepository.save(subscription);
  }

  private async findOneOrThrow(
    where: FindOptionsWhere<Subscription>,
  ): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOneBy(where);

    if (!subscription) {
      RpcExceptionHelper.notFound(
        SubscriptionErrorCode.SUBSCRIPTION_NOT_FOUND,
        'Subscription',
      );
    }

    return subscription;
  }

  private async applyImmediateUpgrade(
    stripeSubscriptionId: string,
    newPriceId: string,
  ): Promise<void> {
    await this.releaseScheduleIfAny(stripeSubscriptionId);
    const stripeSub =
      await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    const itemId = stripeSub.items.data[0]?.id;

    await this.stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
    });
  }

  private async scheduleDowngradeAtPeriodEnd(
    stripeSubscriptionId: string,
    newPriceId: string,
  ): Promise<void> {
    await this.releaseScheduleIfAny(stripeSubscriptionId);
    const schedule = await this.stripe.subscriptionSchedules.create({
      from_subscription: stripeSubscriptionId,
    });

    const current = schedule.phases[0];

    await this.stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          items: [{ price: current.items[0].price as string, quantity: 1 }],
          start_date: current.start_date,
          end_date: current.end_date,
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
          proration_behavior: 'none',
        },
      ],
    });
  }

  private async releaseScheduleIfAny(
    stripeSubscriptionId: string,
  ): Promise<void> {
    const sub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (sub.schedule) {
      const scheduleId =
        typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id;
      await this.stripe.subscriptionSchedules.release(scheduleId);
    }
  }

  isActive(subscription: Subscription): boolean {
    const now = new Date();
    return (
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd != null &&
      subscription.currentPeriodEnd > now
    );
  }

  // Called when auth-ms emits customer.anonymized.
  // Nulls userId so the subscription row can no longer be linked back to the
  // customer. PostgreSQL allows multiple NULLs in a unique index, so this is
  // safe for multiple anonymized customers.
  // Safe to call multiple times: second call matches zero rows and is a no-op.
  async anonymizeCustomerSubscription(userId: string): Promise<number> {
    const result = await this.subscriptionRepository.update(
      { userId },
      { userId: null },
    );
    const affected = result.affected ?? 0;
    this.logger.log(
      `customer.anonymized: nulled userId on ${affected} subscription(s) for userId=${userId}`,
    );
    return affected;
  }
}
