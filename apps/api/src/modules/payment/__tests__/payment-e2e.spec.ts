/**
 * E2E-style integration test for critical payment flows.
 * Tests the full chain: purchase → webhook → fulfillment → download
 * without hitting real Stripe or databases.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from '../payment.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DigitalProductService } from '../../digital-product/digital-product.service';

describe('Payment E2E Flows', () => {
  let prisma: jest.Mocked<PrismaService>;
  let digitalProductService: jest.Mocked<DigitalProductService>;
  let paymentService: PaymentService;

  const mockTenantId = 'tenant-e2e';
  const mockUserId = 'user-e2e';

  beforeAll(async () => {
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
            fulfillOrder: jest.fn().mockResolvedValue({ orderId: 'order-1', downloadToken: 'tok-abc' }),
          },
        },
      ],
    }).compile();

    paymentService = module.get(PaymentService);
    prisma = module.get(PrismaService);
    digitalProductService = module.get(DigitalProductService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Flow 1: Digital Product Purchase → Webhook → Fulfillment ───

  describe('Digital Product: checkout → webhook → fulfillment', () => {
    it('should fulfill order when checkout.session.completed webhook arrives', async () => {
      const webhookPayload = {
        id: 'evt_dp_001',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_dp_session_123',
            payment_intent: 'pi_dp_payment_456',
            metadata: { type: 'digital_product' },
          },
        },
      };

      const result = await paymentService.handleWebhook(
        'unused-sig',
        Buffer.from(JSON.stringify(webhookPayload)),
      );

      expect(result).toEqual({ received: true });

      // Verify fulfillOrder was called with correct session and payment IDs
      expect(digitalProductService.fulfillOrder).toHaveBeenCalledWith(
        'cs_dp_session_123',
        'pi_dp_payment_456',
      );

      // Subscription logic should NOT be triggered
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('should handle fulfillment errors gracefully without crashing webhook', async () => {
      (digitalProductService.fulfillOrder as jest.Mock).mockRejectedValueOnce(
        new Error('Order not found'),
      );

      const webhookPayload = {
        id: 'evt_dp_002',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_dp_missing',
            payment_intent: 'pi_dp_missing',
            metadata: { type: 'digital_product' },
          },
        },
      };

      // Webhook should propagate the error (Stripe will retry)
      await expect(
        paymentService.handleWebhook('sig', Buffer.from(JSON.stringify(webhookPayload))),
      ).rejects.toThrow('Order not found');
    });
  });

  // ─── Flow 2: Subscription → Webhook → Create/Update ───

  describe('Subscription: checkout → webhook → create subscription', () => {
    it('should create new subscription when none exists', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.subscription.create as jest.Mock).mockResolvedValue({ id: 'sub-new' });

      const webhookPayload = {
        id: 'evt_sub_001',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_sub_session_789',
            metadata: { tenantId: mockTenantId, userId: mockUserId },
            subscription: 'sub_stripe_abc',
          },
        },
      };

      const result = await paymentService.handleWebhook(
        'sig',
        Buffer.from(JSON.stringify(webhookPayload)),
      );

      expect(result).toEqual({ received: true });
      expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
      });
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          userId: mockUserId,
          stripeSubscriptionId: 'sub_stripe_abc',
          status: 'ACTIVE',
        }),
      });
      // Should NOT call digitalProductService
      expect(digitalProductService.fulfillOrder).not.toHaveBeenCalled();
    });

    it('should update existing subscription on renewal', async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
        id: 'sub-existing',
        tenantId: mockTenantId,
      });
      (prisma.subscription.update as jest.Mock).mockResolvedValue({});

      const webhookPayload = {
        id: 'evt_sub_002',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_sub_renew',
            metadata: { tenantId: mockTenantId, userId: mockUserId },
            subscription: 'sub_stripe_renewed',
          },
        },
      };

      const result = await paymentService.handleWebhook(
        'sig',
        Buffer.from(JSON.stringify(webhookPayload)),
      );

      expect(result).toEqual({ received: true });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-existing' },
        data: expect.objectContaining({
          stripeSubscriptionId: 'sub_stripe_renewed',
          status: 'ACTIVE',
        }),
      });
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });
  });

  // ─── Flow 3: Edge Cases ───

  describe('Webhook edge cases', () => {
    it('should ignore unhandled event types', async () => {
      const webhookPayload = {
        id: 'evt_unknown',
        type: 'payment_method.attached',
        data: { object: { id: 'pm_123' } },
      };

      const result = await paymentService.handleWebhook(
        'sig',
        Buffer.from(JSON.stringify(webhookPayload)),
      );

      expect(result).toEqual({ received: true });
      expect(digitalProductService.fulfillOrder).not.toHaveBeenCalled();
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('should handle missing metadata without crashing', async () => {
      const webhookPayload = {
        id: 'evt_no_meta',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_no_meta' } },
      };

      const result = await paymentService.handleWebhook(
        'sig',
        Buffer.from(JSON.stringify(webhookPayload)),
      );

      expect(result).toEqual({ received: true });
      expect(digitalProductService.fulfillOrder).not.toHaveBeenCalled();
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('should handle checkout with metadata but no subscription ID', async () => {
      const webhookPayload = {
        id: 'evt_no_sub',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_no_sub',
            metadata: { tenantId: mockTenantId, userId: mockUserId },
            // no subscription field
          },
        },
      };

      const result = await paymentService.handleWebhook(
        'sig',
        Buffer.from(JSON.stringify(webhookPayload)),
      );

      expect(result).toEqual({ received: true });
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('should reject webhook with missing body', async () => {
      await expect(
        paymentService.handleWebhook('sig', undefined),
      ).rejects.toThrow('errors.payment.missingRawBody');
    });
  });
});
