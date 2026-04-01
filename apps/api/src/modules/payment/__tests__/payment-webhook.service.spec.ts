import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from '../payment.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { DigitalProductService } from '../../digital-product/digital-product.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

describe('PaymentService — handleCheckoutCompleted (via handleWebhook)', () => {
  let service: PaymentService;
  let prisma: jest.Mocked<PrismaService>;
  let digitalProductService: jest.Mocked<DigitalProductService>;

  const mockTenantId = 'tenant-001';
  const mockUserId = 'user-001';

  /**
   * Build a raw webhook body for checkout.session.completed events.
   * Since STRIPE_WEBHOOK_SECRET is not set, the service parses JSON directly.
   */
  const buildCheckoutEvent = (sessionData: Record<string, unknown>): Buffer => {
    const event = {
      id: 'evt_test_001',
      type: 'checkout.session.completed',
      data: { object: sessionData },
    };
    return Buffer.from(JSON.stringify(event));
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: {
            subscription: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              // Return undefined for STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
              // so the service skips Stripe SDK init and signature verification.
              const map: Record<string, string | undefined> = {
                STRIPE_SECRET_KEY: undefined,
                STRIPE_WEBHOOK_SECRET: undefined,
                FRONTEND_URL: 'http://localhost:3001',
              };
              return map[key];
            }),
          },
        },
        {
          provide: DigitalProductService,
          useValue: {
            fulfillOrder: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    prisma = module.get(PrismaService);
    digitalProductService = module.get(DigitalProductService);
  });

  // ─── 1. Digital product purchase ───

  describe('when metadata.type === "digital_product"', () => {
    it('should call digitalProductService.fulfillOrder and NOT touch subscription', async () => {
      const rawBody = buildCheckoutEvent({
        id: 'cs_dp_123',
        payment_intent: 'pi_dp_456',
        metadata: { type: 'digital_product' },
      });

      const result = await service.handleWebhook('unused-sig', rawBody);

      expect(result).toEqual({ received: true });
      expect(digitalProductService.fulfillOrder).toHaveBeenCalledWith(
        'cs_dp_123',
        'pi_dp_456',
      );
      expect(digitalProductService.fulfillOrder).toHaveBeenCalledTimes(1);

      // Subscription logic should NOT be triggered
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
      expect(prisma.subscription.create).not.toHaveBeenCalled();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  // ─── 2. Subscription flow ───

  describe('when metadata has tenantId and userId (subscription flow)', () => {
    it('should create a new subscription when none exists', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.subscription.create as jest.Mock).mockResolvedValue({} as any);

      const rawBody = buildCheckoutEvent({
        id: 'cs_sub_123',
        metadata: { tenantId: mockTenantId, userId: mockUserId },
        subscription: 'sub_stripe_789',
      });

      const result = await service.handleWebhook('unused-sig', rawBody);

      expect(result).toEqual({ received: true });
      expect(digitalProductService.fulfillOrder).not.toHaveBeenCalled();
      expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
      });
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          userId: mockUserId,
          plan: SubscriptionPlan.PRO,
          stripeSubscriptionId: 'sub_stripe_789',
          status: SubscriptionStatus.ACTIVE,
        }),
      });
    });

    it('should update an existing subscription', async () => {
      const existingSub = { id: 'sub-local-001' };
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(existingSub as any);
      (prisma.subscription.update as jest.Mock).mockResolvedValue({} as any);

      const rawBody = buildCheckoutEvent({
        id: 'cs_sub_456',
        metadata: { tenantId: mockTenantId, userId: mockUserId },
        subscription: 'sub_stripe_999',
      });

      const result = await service.handleWebhook('unused-sig', rawBody);

      expect(result).toEqual({ received: true });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-local-001' },
        data: expect.objectContaining({
          plan: SubscriptionPlan.PRO,
          stripeSubscriptionId: 'sub_stripe_999',
          status: SubscriptionStatus.ACTIVE,
        }),
      });
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('should return early when subscription id is missing from session data', async () => {
      const rawBody = buildCheckoutEvent({
        id: 'cs_nosub',
        metadata: { tenantId: mockTenantId, userId: mockUserId },
        // no `subscription` field
      });

      const result = await service.handleWebhook('unused-sig', rawBody);

      expect(result).toEqual({ received: true });
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
      expect(prisma.subscription.create).not.toHaveBeenCalled();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  // ─── 3. Missing metadata ───

  describe('when metadata is missing required fields', () => {
    it('should log warning and return when metadata is undefined', async () => {
      const rawBody = buildCheckoutEvent({
        id: 'cs_nometa',
        // no metadata
      });

      const result = await service.handleWebhook('unused-sig', rawBody);

      expect(result).toEqual({ received: true });
      expect(digitalProductService.fulfillOrder).not.toHaveBeenCalled();
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('should log warning and return when tenantId is missing', async () => {
      const rawBody = buildCheckoutEvent({
        id: 'cs_partial',
        metadata: { userId: mockUserId },
      });

      const result = await service.handleWebhook('unused-sig', rawBody);

      expect(result).toEqual({ received: true });
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('should log warning and return when userId is missing', async () => {
      const rawBody = buildCheckoutEvent({
        id: 'cs_partial2',
        metadata: { tenantId: mockTenantId },
      });

      const result = await service.handleWebhook('unused-sig', rawBody);

      expect(result).toEqual({ received: true });
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });
  });
});
