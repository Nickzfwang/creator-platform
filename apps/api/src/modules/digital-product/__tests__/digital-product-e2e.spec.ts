/**
 * E2E-style test: digital product purchase → checkout → fulfillment → download
 * Validates the full buyer journey without hitting real Stripe.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DigitalProductService } from '../digital-product.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

// Mock Stripe
const mockStripeCheckout = { create: jest.fn() };
const mockStripe = { checkout: { sessions: mockStripeCheckout } };

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockStripe),
}));

describe('Digital Product E2E: Purchase → Fulfillment → Download', () => {
  let service: DigitalProductService;
  let prisma: jest.Mocked<PrismaService>;

  // Shared state across the flow steps
  let orderId: string;
  let downloadToken: string;

  const mockProduct = {
    id: 'prod-e2e',
    userId: 'seller-1',
    tenantId: 'tenant-1',
    name: 'Design Masterclass',
    description: 'Complete design course',
    productType: 'DIGITAL_DOWNLOAD',
    price: 49900,
    currency: 'TWD',
    coverImageUrl: 'https://example.com/cover.png',
    fileUrl: 'https://storage.example.com/files/masterclass.zip',
    isPublished: true,
    salesCount: 10,
    totalRevenue: 499000,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigitalProductService,
        {
          provide: PrismaService,
          useValue: {
            digitalProduct: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            productOrder: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn((args) => {
              if (Array.isArray(args)) return Promise.all(args);
              return args(prisma);
            }),
          },
        },
        {
          provide: AiService,
          useValue: { isAvailable: false, generateJson: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'STRIPE_SECRET_KEY') return 'sk_test_e2e';
              if (key === 'FRONTEND_URL') return 'http://localhost:3001';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(DigitalProductService);
    prisma = module.get(PrismaService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Step 1: Buyer initiates purchase ───

  it('Step 1: purchase() creates order + Stripe checkout session', async () => {
    (prisma.digitalProduct.findUnique as jest.Mock).mockResolvedValue(mockProduct);
    (prisma.productOrder.create as jest.Mock).mockResolvedValue({
      id: 'order-e2e-1',
      productId: 'prod-e2e',
      buyerEmail: 'buyer@test.com',
      buyerName: 'Test Buyer',
      amount: 49900,
      currency: 'TWD',
      status: 'PENDING',
    });
    (prisma.productOrder.update as jest.Mock).mockResolvedValue({});

    mockStripeCheckout.create.mockResolvedValue({
      id: 'cs_e2e_session',
      url: 'https://checkout.stripe.com/pay/cs_e2e_session',
    });

    const result = await service.purchase('prod-e2e', 'buyer@test.com', 'Test Buyer');

    orderId = result.orderId;

    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_e2e_session');
    expect(result.orderId).toBe('order-e2e-1');

    // Verify Stripe session metadata contains order info for webhook
    expect(mockStripeCheckout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer_email: 'buyer@test.com',
        metadata: expect.objectContaining({
          type: 'digital_product',
          orderId: 'order-e2e-1',
          productId: 'prod-e2e',
        }),
      }),
    );
  });

  // ─── Step 2: Stripe webhook triggers fulfillment ───

  it('Step 2: fulfillOrder() marks order COMPLETED and generates download token', async () => {
    (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-e2e-1',
      productId: 'prod-e2e',
      amount: 49900,
      status: 'PENDING',
      stripeSessionId: 'cs_e2e_session',
      product: mockProduct,
    });
    (prisma.productOrder.update as jest.Mock).mockResolvedValue({});
    (prisma.digitalProduct.update as jest.Mock).mockResolvedValue({});

    const result = await service.fulfillOrder('cs_e2e_session', 'pi_e2e_payment');

    expect(result).toBeDefined();
    expect(result!.orderId).toBe('order-e2e-1');
    expect(result!.downloadToken).toEqual(expect.any(String));
    expect(result!.downloadToken.length).toBeGreaterThanOrEqual(32);

    downloadToken = result!.downloadToken;

    // Verify order was updated to COMPLETED
    expect(prisma.productOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-e2e-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          stripePaymentIntentId: 'pi_e2e_payment',
          downloadToken: expect.any(String),
          downloadExpiresAt: expect.any(Date),
        }),
      }),
    );

    // Verify sales metrics were incremented
    expect(prisma.digitalProduct.update).toHaveBeenCalledWith({
      where: { id: 'prod-e2e' },
      data: {
        salesCount: { increment: 1 },
        totalRevenue: { increment: 49900 },
      },
    });
  });

  // ─── Step 3: Buyer downloads the product ───

  it('Step 3: getDownloadUrl() returns file URL after validating token', async () => {
    const futureExpiry = new Date(Date.now() + 24 * 3600_000);

    (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-e2e-1',
      status: 'COMPLETED',
      downloadToken,
      downloadExpiresAt: futureExpiry,
      downloadCount: 0,
      product: {
        fileUrl: 'https://storage.example.com/files/masterclass.zip',
        name: 'Design Masterclass',
      },
    });
    (prisma.productOrder.update as jest.Mock).mockResolvedValue({});

    const result = await service.getDownloadUrl('order-e2e-1', downloadToken);

    expect(result).toEqual({
      fileUrl: 'https://storage.example.com/files/masterclass.zip',
      fileName: 'Design Masterclass',
    });

    // Download count should be incremented
    expect(prisma.productOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-e2e-1' },
      data: { downloadCount: { increment: 1 } },
    });
  });

  // ─── Step 4: Idempotency — fulfillment should not double-count ───

  it('Step 4: fulfillOrder() is idempotent for already-completed orders', async () => {
    (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-e2e-1',
      status: 'COMPLETED',
      product: mockProduct,
    });

    const result = await service.fulfillOrder('cs_e2e_session', 'pi_e2e_payment');

    expect(result).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── Step 5: Expired download link ───

  it('Step 5: getDownloadUrl() rejects expired token', async () => {
    const pastExpiry = new Date(Date.now() - 3600_000);

    (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue({
      id: 'order-e2e-1',
      status: 'COMPLETED',
      downloadToken,
      downloadExpiresAt: pastExpiry,
      product: { fileUrl: 'url', name: 'file' },
    });

    await expect(
      service.getDownloadUrl('order-e2e-1', downloadToken),
    ).rejects.toThrow();
  });
});
