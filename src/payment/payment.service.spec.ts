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
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from '../common/dto/payment-status.enum';
import { STRIPE_CLIENT } from '../config/services';

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const PAY_A_ID = 'pay-a-pending';
const PAY_B_ID = 'pay-b-pending';
const PAY_COMP_ID = 'pay-completed';

function matchesWhere(row: any, where: any): boolean {
  return Object.entries(where).every(
    ([k, v]) => v === undefined || row[k] === v,
  );
}

describe('PaymentService.update — IDOR & state-machine regression', () => {
  let service: PaymentService;
  let rows: any[];

  const fakeRepo = {
    findOneBy: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  };

  function makeRows() {
    return [
      {
        id: PAY_A_ID,
        organizationId: ORG_A,
        status: PaymentStatus.PENDING,
        subscriptionId: null,
        amount: 1000,
      },
      {
        id: PAY_B_ID,
        organizationId: ORG_B,
        status: PaymentStatus.PENDING,
        subscriptionId: null,
        amount: 2000,
      },
      {
        id: PAY_COMP_ID,
        organizationId: ORG_A,
        status: PaymentStatus.COMPLETED,
        subscriptionId: null,
        amount: 3000,
      },
    ];
  }

  beforeEach(async () => {
    rows = makeRows();

    fakeRepo.findOneBy.mockImplementation(async (where: any) =>
      rows.find((r) => matchesWhere(r, where)) ?? null,
    );
    fakeRepo.update.mockResolvedValue({ affected: 1 });
    fakeRepo.save.mockImplementation(async (o: any) => o);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: fakeRepo },
        { provide: STRIPE_CLIENT, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── cross-tenant guard ──────────────────────────────────────────────────
  it('rejects (forbidden) when payment org does not match dto org', async () => {
    await expect(
      service.update({
        paymentId: PAY_B_ID,
        organizationId: ORG_A,
        status: PaymentStatus.COMPLETED,
      }),
    ).rejects.toThrow();
    expect(fakeRepo.update).not.toHaveBeenCalled();
  });

  // ─── idempotency guard ───────────────────────────────────────────────────
  it('returns the payment unchanged without calling update when status is already the same', async () => {
    const result = await service.update({
      paymentId: PAY_A_ID,
      organizationId: ORG_A,
      status: PaymentStatus.PENDING,
    });
    expect(fakeRepo.update).not.toHaveBeenCalled();
    expect((result as any).id).toBe(PAY_A_ID);
  });

  // ─── finalized guard ─────────────────────────────────────────────────────
  it('rejects when attempting to change status of a COMPLETED payment', async () => {
    await expect(
      service.update({
        paymentId: PAY_COMP_ID,
        organizationId: ORG_A,
        status: PaymentStatus.PENDING,
      }),
    ).rejects.toThrow();
    expect(fakeRepo.update).not.toHaveBeenCalled();
  });

  it('rejects when attempting to change status of a FAILED payment', async () => {
    const failedId = 'pay-failed';
    rows.push({
      id: failedId,
      organizationId: ORG_A,
      status: PaymentStatus.FAILED,
      subscriptionId: null,
      amount: 500,
    });
    await expect(
      service.update({
        paymentId: failedId,
        organizationId: ORG_A,
        status: PaymentStatus.PENDING,
      }),
    ).rejects.toThrow();
    expect(fakeRepo.update).not.toHaveBeenCalled();
  });

  // ─── happy path ──────────────────────────────────────────────────────────
  it('calls update once when transitioning PENDING → COMPLETED for the correct org', async () => {
    await service.update({
      paymentId: PAY_A_ID,
      organizationId: ORG_A,
      status: PaymentStatus.COMPLETED,
    });
    expect(fakeRepo.update).toHaveBeenCalledTimes(1);
    expect(fakeRepo.update).toHaveBeenCalledWith(
      PAY_A_ID,
      expect.objectContaining({ status: PaymentStatus.COMPLETED }),
    );
  });
});
