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

import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PaymentService } from '../payment/payment.service';
import { SubscriptionHandler } from './handlers/subscription.handler';
import { PaymentProvider } from '../payment/enums/payment-provider.enum';
import {
  ORDERS_EVENTS_CLIENT,
  ORGANIZATION_EVENTS_CLIENT,
} from '../config/services';

const STRIPE_PAYLOAD = {
  provider: PaymentProvider.STRIPE,
  event: {
    id: 'evt_test_001',
    type: 'account.external_account.created',
    data: { object: {} },
    object: 'event',
    api_version: '2024-04-10',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as any,
};

describe('WebhooksService.handleEvent — idempotency regression', () => {
  let service: WebhooksService;
  let module: TestingModule;
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockPaymentService: { updateStatus: jest.Mock; findOneBy: jest.Mock };

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    mockPaymentService = {
      updateStatus: jest.fn(),
      findOneBy: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PaymentService, useValue: mockPaymentService },
        {
          provide: SubscriptionHandler,
          useValue: {
            handleSubscriptionPaid: jest.fn(),
            handleSubscriptionPaymentFailed: jest.fn(),
            handleSubscriptionDeleted: jest.fn(),
            handleSubscriptionUpdated: jest.fn(),
          },
        },
        { provide: ORDERS_EVENTS_CLIENT, useValue: { emit: jest.fn() } },
        { provide: ORGANIZATION_EVENTS_CLIENT, useValue: { emit: jest.fn() } },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── provider guard ──────────────────────────────────────────────────────
  it('ignores non-Stripe providers without touching Redis', async () => {
    const result = await service.handleEvent({
      provider: PaymentProvider.PAYPAL,
      event: STRIPE_PAYLOAD.event,
    });
    expect(result).toEqual({ ignored: true });
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  // ─── done-key idempotency guard ──────────────────────────────────────────
  it('returns { idempotent: true } and skips processing when the done key exists', async () => {
    mockRedis.get.mockResolvedValueOnce('1');

    const result = await service.handleEvent(STRIPE_PAYLOAD);

    expect(result).toEqual({ idempotent: true });
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  // ─── lock guard ──────────────────────────────────────────────────────────
  it('returns { inProgress: true } and skips processing when the lock is already held', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValueOnce(null); // NX returns null → not acquired

    const result = await service.handleEvent(STRIPE_PAYLOAD);

    expect(result).toEqual({ inProgress: true });
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  // ─── success path ────────────────────────────────────────────────────────
  it('processes the event, marks it done, and releases the lock', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set
      .mockResolvedValueOnce('OK')       // lock acquired
      .mockResolvedValueOnce(undefined); // done key marked
    mockRedis.del.mockResolvedValueOnce(1);

    const result = await service.handleEvent(STRIPE_PAYLOAD);

    expect(result).toEqual({ externalAccountAdded: true });
    // Two set calls: lock + done key
    expect(mockRedis.set).toHaveBeenCalledTimes(2);
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
  });

  // ─── finally-block lock release ──────────────────────────────────────────
  it('releases the lock in the finally block even when processEvent throws', async () => {
    // Use an event type that calls paymentService.update
    const failingPayload = {
      provider: PaymentProvider.STRIPE,
      event: {
        ...STRIPE_PAYLOAD.event,
        id: 'evt_test_002',
        type: 'checkout.session.expired',
        data: {
          object: {
            metadata: { paymentId: 'pay-xyz', organizationId: 'org-xyz' },
          },
        },
      } as any,
    };

    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValueOnce('OK'); // lock acquired
    mockRedis.del.mockResolvedValueOnce(1);    // lock released in finally
    mockPaymentService.updateStatus.mockRejectedValueOnce(new Error('db error'));

    await expect(service.handleEvent(failingPayload)).rejects.toThrow('db error');
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
  });
});
