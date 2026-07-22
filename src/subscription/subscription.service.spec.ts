// Must be before any imports — Jest hoists this to bypass env validation
jest.mock('src/config', () => ({
  envs: {
    nodeEnv: 'test',
    port: 3000,
    dbPort: 5432,
    dbHost: 'localhost',
    postgresUser: 'user',
    postgresPassword: 'pass',
    postgresDb: 'db',
    rabbitmqUrl: 'amqp://localhost',
    rabbitmqQueue: 'queue',
    rabbitmqOrdersEventQueue: 'orders-events',
    rabbitmqPaymentEventQueue: 'payment-events',
    rabbitmqOrganizationQueue: 'org-events',
    clientUrl: 'http://localhost:3000',
    stripeSecret: 'sk_test_xxx',
    redisHost: 'localhost',
    redisPort: 6379,
    redisPass: 'pass',
    stripePriceIdBasic: 'price_basic',
    stripePriceIdPro: 'price_pro',
  },
  RMQ_SERVICE: 'RMQ_SERVICE',
}));

/**
 * SubscriptionService — logic tests for changePlan / cancel / resume.
 *
 * These characterize what the real code DOES today (per Phase 1 audit), not
 * what a subscription lifecycle "should" do. Mocks the Stripe SDK and the
 * TypeORM repository; follows the only working test precedent in this repo
 * (webhooks.service.spec.ts): hoisted config mock + Test.createTestingModule
 * with useValue mocks for every dependency.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';

import { SubscriptionService } from './subscription.service';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { SubscriptionStatus } from './enums/subscription-status.enum';
import { SubscriptionErrorCode } from './enums/subscription-error-code.enum';
import { STRIPE_CLIENT } from 'src/config/services';
import { PaymentService } from 'src/payment/payment.service';
import { PaymentProviderFactory } from 'src/providers/payment-provider.factory';

const SUBSCRIPTION_ID = 'sub00000-aaaa-aaaa-aaaa-000000000001';
const USER_ID = 'usr00000-aaaa-aaaa-aaaa-000000000001';
const STRIPE_SUB_ID = 'sub_stripe_001';

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: SUBSCRIPTION_ID,
    userId: USER_ID,
    plan: SubscriptionPlan.BASIC,
    status: SubscriptionStatus.ACTIVE,
    stripeSubscriptionId: STRIPE_SUB_ID,
    currentPeriodStart: undefined,
    currentPeriodEnd: undefined,
    cancelAtPeriodEnd: false,
    priceAmount: undefined,
    currency: undefined,
    stripePriceId: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Subscription;
}

describe('SubscriptionService — changePlan / cancel / resume (real logic)', () => {
  let service: SubscriptionService;
  let repo: {
    findOneBy: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let stripe: {
    subscriptions: { update: jest.Mock; retrieve: jest.Mock };
    subscriptionSchedules: { create: jest.Mock; update: jest.Mock; release: jest.Mock };
  };

  beforeEach(async () => {
    repo = {
      findOneBy: jest.fn(),
      save: jest.fn(async (sub) => sub),
      create: jest.fn(),
      update: jest.fn(),
    };
    stripe = {
      subscriptions: {
        update: jest.fn().mockResolvedValue({}),
        retrieve: jest.fn().mockResolvedValue({ schedule: null, items: { data: [{ id: 'si_1' }] } }),
      },
      subscriptionSchedules: {
        create: jest.fn().mockResolvedValue({
          id: 'sched_1',
          phases: [
            { start_date: 1000, end_date: 2000, items: [{ price: 'price_basic' }] },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
        release: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: getRepositoryToken(Subscription), useValue: repo },
        { provide: STRIPE_CLIENT, useValue: stripe },
        { provide: PaymentService, useValue: { getPendingPayment: jest.fn(), create: jest.fn(), updateStatus: jest.fn() } },
        { provide: PaymentProviderFactory, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── not-found / wrong-owner (shared across all three methods) ───────────
  describe('not-found / wrong-owner', () => {
    it('changePlan throws RpcException(SUBSCRIPTION_NOT_FOUND, 404) when no row matches { id, userId }', async () => {
      repo.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.changePlan(SUBSCRIPTION_ID, USER_ID, SubscriptionPlan.PRO),
      ).rejects.toMatchObject({
        error: expect.objectContaining({
          code: SubscriptionErrorCode.SUBSCRIPTION_NOT_FOUND,
          statusCode: 404,
        }),
      });
    });

    // PINS CURRENT BEHAVIOR: a wrong-owner request (subscription exists, but
    // belongs to a different userId) is indistinguishable from a truly
    // nonexistent subscription — both hit findOneOrThrow({ id, userId }) and
    // produce the identical 404 SUBSCRIPTION_NOT_FOUND. There is no separate
    // "forbidden" error for wrong ownership.
    it('wrong-owner and truly-nonexistent both produce the same 404 SUBSCRIPTION_NOT_FOUND (indistinguishable)', async () => {
      // findOneBy({ id, userId }) returns null in both cases from the
      // service's point of view — simulate by returning null regardless of
      // which userId was passed.
      repo.findOneBy.mockResolvedValue(null);

      const notFoundErr = await service
        .cancel(SUBSCRIPTION_ID, USER_ID)
        .catch((e) => e);
      const wrongOwnerErr = await service
        .cancel(SUBSCRIPTION_ID, 'a-different-user-id')
        .catch((e) => e);

      expect(notFoundErr).toBeInstanceOf(RpcException);
      expect(wrongOwnerErr).toBeInstanceOf(RpcException);
      expect(notFoundErr.error).toEqual(wrongOwnerErr.error);
      expect(notFoundErr.error.code).toBe(SubscriptionErrorCode.SUBSCRIPTION_NOT_FOUND);
    });
  });

  // ─── changePlan ────────────────────────────────────────────────────────
  describe('changePlan', () => {
    it('throws SUBSCRIPTION_CANCELED (403) when the subscription is already CANCELED', async () => {
      repo.findOneBy.mockResolvedValueOnce(
        makeSubscription({ status: SubscriptionStatus.CANCELED }),
      );

      await expect(
        service.changePlan(SUBSCRIPTION_ID, USER_ID, SubscriptionPlan.PRO),
      ).rejects.toMatchObject({
        error: expect.objectContaining({
          code: SubscriptionErrorCode.SUBSCRIPTION_CANCELED,
          statusCode: 403,
        }),
      });
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    });

    it('is a no-op (no Stripe call, no save) when the requested plan matches the current plan', async () => {
      const sub = makeSubscription({ plan: SubscriptionPlan.PRO });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.changePlan(SUBSCRIPTION_ID, USER_ID, SubscriptionPlan.PRO);

      expect(result).toBe(sub);
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(stripe.subscriptionSchedules.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('when there is no live Stripe subscription, sets the plan locally and saves (no Stripe call)', async () => {
      const sub = makeSubscription({ stripeSubscriptionId: undefined, plan: SubscriptionPlan.BASIC });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.changePlan(SUBSCRIPTION_ID, USER_ID, SubscriptionPlan.PRO);

      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.plan).toBe(SubscriptionPlan.PRO);
    });

    it('UPGRADE (BASIC → PRO, has live Stripe sub): calls subscriptions.update with immediate/proration params AND persists the new plan locally (fixed — Issue 1 upgrade case)', async () => {
      const sub = makeSubscription({ plan: SubscriptionPlan.BASIC });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.changePlan(SUBSCRIPTION_ID, USER_ID, SubscriptionPlan.PRO);

      expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith(STRIPE_SUB_ID);
      expect(stripe.subscriptions.update).toHaveBeenCalledWith(STRIPE_SUB_ID, {
        items: [{ id: 'si_1', price: 'price_pro' }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
      });
      expect(stripe.subscriptionSchedules.create).not.toHaveBeenCalled();

      // Fixed: an upgrade is effective immediately in Stripe, so the local
      // plan is now persisted right away instead of waiting on the
      // customer.subscription.updated webhook.
      expect(result.plan).toBe(SubscriptionPlan.PRO);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    // PINS CURRENT BEHAVIOR (KNOWN BUG, downgrade case still open): a
    // downgrade is deferred to period end via a Stripe schedule, so the new
    // plan is not active yet — persisting it locally now would be wrong. The
    // entity has no pendingPlan/scheduledPlan field to record the scheduled
    // change instead, so this branch still relies entirely on
    // customer.subscription.updated to reflect the change once it lands (see
    // ISSUES.md, Issue 1). Test should go RED when a pending-plan field is
    // added and this branch is updated to use it.
    it('DOWNGRADE (PRO → BASIC, has live Stripe sub): creates a subscription schedule for period-end, but does NOT persist the new plan locally', async () => {
      const sub = makeSubscription({ plan: SubscriptionPlan.PRO });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.changePlan(SUBSCRIPTION_ID, USER_ID, SubscriptionPlan.BASIC);

      expect(stripe.subscriptionSchedules.create).toHaveBeenCalledWith({
        from_subscription: STRIPE_SUB_ID,
      });
      expect(stripe.subscriptionSchedules.update).toHaveBeenCalledWith('sched_1', {
        end_behavior: 'release',
        phases: [
          {
            items: [{ price: 'price_basic', quantity: 1 }],
            start_date: 1000,
            end_date: 2000,
          },
          {
            items: [{ price: 'price_basic', quantity: 1 }],
            proration_behavior: 'none',
          },
        ],
      });
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();

      // PINS CURRENT BEHAVIOR (KNOWN BUG): plan not persisted locally here;
      // relies on customer.subscription.updated webhook. Test should go RED
      // when fixed.
      expect(result.plan).toBe(SubscriptionPlan.PRO);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('upgrade/downgrade first release any pending schedule on the Stripe subscription', async () => {
      const sub = makeSubscription({ plan: SubscriptionPlan.BASIC });
      repo.findOneBy.mockResolvedValueOnce(sub);
      stripe.subscriptions.retrieve.mockResolvedValueOnce({
        schedule: 'sched_pending',
        items: { data: [{ id: 'si_1' }] },
      });

      await service.changePlan(SUBSCRIPTION_ID, USER_ID, SubscriptionPlan.PRO);

      expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_pending');
    });
  });

  // ─── cancel ────────────────────────────────────────────────────────────
  describe('cancel', () => {
    it('is an idempotent no-op when already CANCELED', async () => {
      const sub = makeSubscription({ status: SubscriptionStatus.CANCELED });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.cancel(SUBSCRIPTION_ID, USER_ID);

      expect(result).toBe(sub);
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('with a live Stripe subscription: sets cancel_at_period_end true, flags cancelAtPeriodEnd, does NOT set status to CANCELED, and saves', async () => {
      const sub = makeSubscription({ status: SubscriptionStatus.ACTIVE, cancelAtPeriodEnd: false });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.cancel(SUBSCRIPTION_ID, USER_ID);

      expect(stripe.subscriptions.update).toHaveBeenCalledWith(STRIPE_SUB_ID, {
        cancel_at_period_end: true,
      });
      expect(result.cancelAtPeriodEnd).toBe(true);
      // PINS CURRENT BEHAVIOR: status stays ACTIVE synchronously; the actual
      // CANCELED transition only happens later via the
      // customer.subscription.deleted webhook.
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('with no Stripe subscription: sets status to CANCELED synchronously, no Stripe call', async () => {
      const sub = makeSubscription({ stripeSubscriptionId: undefined, status: SubscriptionStatus.PROCESSING });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.cancel(SUBSCRIPTION_ID, USER_ID);

      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.CANCELED);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('releases any pending schedule before canceling', async () => {
      const sub = makeSubscription();
      repo.findOneBy.mockResolvedValueOnce(sub);
      stripe.subscriptions.retrieve.mockResolvedValueOnce({ schedule: 'sched_pending' });

      await service.cancel(SUBSCRIPTION_ID, USER_ID);

      expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_pending');
    });
  });

  // ─── resume ────────────────────────────────────────────────────────────
  describe('resume', () => {
    it('throws SUBSCRIPTION_CANCELED (403) when the subscription is already CANCELED', async () => {
      repo.findOneBy.mockResolvedValueOnce(
        makeSubscription({ status: SubscriptionStatus.CANCELED }),
      );

      await expect(service.resume(SUBSCRIPTION_ID, USER_ID)).rejects.toMatchObject({
        error: expect.objectContaining({
          code: SubscriptionErrorCode.SUBSCRIPTION_CANCELED,
          statusCode: 403,
        }),
      });
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    });

    it('is a no-op when there is no Stripe subscription', async () => {
      const sub = makeSubscription({ stripeSubscriptionId: undefined, cancelAtPeriodEnd: true });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.resume(SUBSCRIPTION_ID, USER_ID);

      expect(result).toBe(sub);
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('is a no-op when there is no pending cancellation (cancelAtPeriodEnd false)', async () => {
      const sub = makeSubscription({ cancelAtPeriodEnd: false });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.resume(SUBSCRIPTION_ID, USER_ID);

      expect(result).toBe(sub);
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('happy path: clears cancel_at_period_end on Stripe, clears the local flag, and saves', async () => {
      const sub = makeSubscription({ cancelAtPeriodEnd: true });
      repo.findOneBy.mockResolvedValueOnce(sub);

      const result = await service.resume(SUBSCRIPTION_ID, USER_ID);

      expect(stripe.subscriptions.update).toHaveBeenCalledWith(STRIPE_SUB_ID, {
        cancel_at_period_end: false,
      });
      expect(result.cancelAtPeriodEnd).toBe(false);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    // PINS NON-OBVIOUS SIDE EFFECT: resume also discards a pending downgrade
    // schedule. Confirm this is intended.
    it('resuming a subscription with a pending downgrade schedule releases that schedule as a side effect', async () => {
      const sub = makeSubscription({ cancelAtPeriodEnd: true });
      repo.findOneBy.mockResolvedValueOnce(sub);
      stripe.subscriptions.retrieve.mockResolvedValueOnce({ schedule: 'sched_pending_downgrade' });

      await service.resume(SUBSCRIPTION_ID, USER_ID);

      // PINS NON-OBVIOUS SIDE EFFECT: resume also discards a pending
      // downgrade schedule. Confirm this is intended.
      expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith(
        'sched_pending_downgrade',
      );
    });
  });
});
