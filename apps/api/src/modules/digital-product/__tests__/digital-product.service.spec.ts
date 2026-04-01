import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DigitalProductService } from '../digital-product.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

// Mock Stripe constructor
const mockStripe = {
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
};

jest.mock('stripe', () => {
  const MockStripe = jest.fn().mockImplementation(() => mockStripe);
  return { __esModule: true, default: MockStripe };
});

describe('DigitalProductService', () => {
  let service: DigitalProductService;
  let prisma: jest.Mocked<PrismaService>;

  const mockProduct = (overrides: Partial<any> = {}) => ({
    id: 'product-1',
    userId: 'seller-1',
    tenantId: 'tenant-1',
    name: 'Ultimate Design Kit',
    description: 'A comprehensive design toolkit',
    aiDescription: 'AI-generated description',
    productType: 'DIGITAL_DOWNLOAD',
    price: 99900, // cents
    compareAtPrice: null,
    currency: 'TWD',
    coverImageUrl: 'https://example.com/cover.png',
    fileUrl: 'https://storage.example.com/files/design-kit.zip',
    tags: ['design', 'toolkit'],
    aiTags: ['ui', 'ux'],
    isPublished: true,
    salesCount: 5,
    totalRevenue: 499500,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  });

  const mockOrder = (overrides: Partial<any> = {}) => ({
    id: 'order-1',
    productId: 'product-1',
    buyerEmail: 'buyer@example.com',
    buyerName: 'Test Buyer',
    amount: 99900,
    currency: 'TWD',
    status: 'PENDING',
    stripeSessionId: 'cs_test_session_123',
    stripePaymentIntentId: null,
    downloadToken: null,
    downloadExpiresAt: null,
    downloadCount: 0,
    createdAt: new Date('2026-03-28T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigitalProductService,
        {
          provide: PrismaService,
          useValue: {
            digitalProduct: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            productOrder: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn((args) => {
              // If args is an array of promises, resolve them all
              if (Array.isArray(args)) return Promise.all(args);
              return args(prisma);
            }),
          },
        },
        {
          provide: AiService,
          useValue: {
            isAvailable: false,
            generateJson: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'STRIPE_SECRET_KEY') return 'sk_test_fake_key';
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

  // ─── purchase() ──────────────────────────────────────────────────────

  describe('purchase', () => {
    it('should create order in PENDING state, create Stripe checkout session, and return checkout URL', async () => {
      // Arrange
      const product = mockProduct();
      (prisma.digitalProduct.findUnique as jest.Mock).mockResolvedValue(product);

      const createdOrder = mockOrder({ stripeSessionId: null });
      (prisma.productOrder.create as jest.Mock).mockResolvedValue(createdOrder);
      (prisma.productOrder.update as jest.Mock).mockResolvedValue({
        ...createdOrder,
        stripeSessionId: 'cs_test_session_456',
      });

      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_session_456',
        url: 'https://checkout.stripe.com/pay/cs_test_session_456',
      });

      // Act
      const result = await service.purchase('product-1', 'buyer@example.com', 'Test Buyer');

      // Assert
      expect(prisma.productOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'product-1',
          buyerEmail: 'buyer@example.com',
          buyerName: 'Test Buyer',
          amount: 99900,
          currency: 'TWD',
          status: 'PENDING',
        }),
      });

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          customer_email: 'buyer@example.com',
          metadata: expect.objectContaining({
            type: 'digital_product',
            orderId: 'order-1',
            productId: 'product-1',
            sellerId: 'seller-1',
          }),
        }),
      );

      expect(prisma.productOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { stripeSessionId: 'cs_test_session_456' },
      });

      expect(result).toEqual({
        orderId: 'order-1',
        checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_session_456',
      });
    });

    it('should throw NotFoundException when product does not exist', async () => {
      (prisma.digitalProduct.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.purchase('nonexistent', 'buyer@example.com'))
        .rejects
        .toThrow(NotFoundException);
    });

    it('should throw NotFoundException when product is not published', async () => {
      const unpublished = mockProduct({ isPublished: false });
      (prisma.digitalProduct.findUnique as jest.Mock).mockResolvedValue(unpublished);

      await expect(service.purchase('product-1', 'buyer@example.com'))
        .rejects
        .toThrow(NotFoundException);
    });

    it('should throw BadRequestException when Stripe is not configured', async () => {
      // Rebuild module without Stripe key
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DigitalProductService,
          {
            provide: PrismaService,
            useValue: prisma,
          },
          {
            provide: AiService,
            useValue: { isAvailable: false, generateJson: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                if (key === 'STRIPE_SECRET_KEY') return undefined;
                if (key === 'FRONTEND_URL') return 'http://localhost:3001';
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const serviceNoStripe = module.get(DigitalProductService);
      const prismaNoStripe: jest.Mocked<PrismaService> = module.get(PrismaService);

      const product = mockProduct();
      (prismaNoStripe.digitalProduct.findUnique as jest.Mock).mockResolvedValue(product);

      await expect(serviceNoStripe.purchase('product-1', 'buyer@example.com'))
        .rejects
        .toThrow(BadRequestException);
    });
  });

  // ─── fulfillOrder() ──────────────────────────────────────────────────

  describe('fulfillOrder', () => {
    it('should update order to COMPLETED, generate download token, and increment sales metrics', async () => {
      // Arrange
      const order = mockOrder({ product: mockProduct() });
      (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue(order);
      (prisma.productOrder.update as jest.Mock).mockResolvedValue({});
      (prisma.digitalProduct.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await service.fulfillOrder('cs_test_session_123', 'pi_test_payment_123');

      // Assert
      expect(prisma.productOrder.findUnique).toHaveBeenCalledWith({
        where: { stripeSessionId: 'cs_test_session_123' },
        include: { product: true },
      });

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.anything(), // productOrder.update
        expect.anything(), // digitalProduct.update
      ]);

      expect(prisma.productOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            stripePaymentIntentId: 'pi_test_payment_123',
            downloadToken: expect.any(String),
            downloadExpiresAt: expect.any(Date),
          }),
        }),
      );

      expect(prisma.digitalProduct.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: {
          salesCount: { increment: 1 },
          totalRevenue: { increment: 99900 },
        },
      });

      expect(result).toEqual({
        orderId: 'order-1',
        downloadToken: expect.any(String),
      });
    });

    it('should return undefined when order is not found', async () => {
      (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.fulfillOrder('cs_unknown', 'pi_test');

      expect(result).toBeUndefined();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should be idempotent — return early if order is already COMPLETED', async () => {
      const completedOrder = mockOrder({
        status: 'COMPLETED',
        product: mockProduct(),
      });
      (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue(completedOrder);

      const result = await service.fulfillOrder('cs_test_session_123', 'pi_test');

      expect(result).toBeUndefined();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── getDownloadUrl() ────────────────────────────────────────────────

  describe('getDownloadUrl', () => {
    const validToken = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    it('should return fileUrl after validating token', async () => {
      // Arrange
      const order = mockOrder({
        status: 'COMPLETED',
        downloadToken: validToken,
        downloadExpiresAt: new Date(Date.now() + 3600_000), // 1 hour from now
        product: { fileUrl: 'https://storage.example.com/files/design-kit.zip', name: 'Ultimate Design Kit' },
      });
      (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue(order);
      (prisma.productOrder.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await service.getDownloadUrl('order-1', validToken);

      // Assert
      expect(result).toEqual({
        fileUrl: 'https://storage.example.com/files/design-kit.zip',
        fileName: 'Ultimate Design Kit',
      });

      expect(prisma.productOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { downloadCount: { increment: 1 } },
      });
    });

    it('should throw NotFoundException when order does not exist', async () => {
      (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getDownloadUrl('nonexistent', validToken))
        .rejects
        .toThrow(NotFoundException);
    });

    it('should throw BadRequestException when download token is wrong', async () => {
      const order = mockOrder({
        status: 'COMPLETED',
        downloadToken: validToken,
        downloadExpiresAt: new Date(Date.now() + 3600_000),
        product: { fileUrl: 'https://example.com/file.zip', name: 'Kit' },
      });
      (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue(order);

      await expect(service.getDownloadUrl('order-1', 'wrong-token'))
        .rejects
        .toThrow(BadRequestException);
    });

    it('should throw BadRequestException when download link is expired', async () => {
      const order = mockOrder({
        status: 'COMPLETED',
        downloadToken: validToken,
        downloadExpiresAt: new Date(Date.now() - 3600_000), // 1 hour ago
        product: { fileUrl: 'https://example.com/file.zip', name: 'Kit' },
      });
      (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue(order);

      await expect(service.getDownloadUrl('order-1', validToken))
        .rejects
        .toThrow(BadRequestException);
    });

    it('should throw BadRequestException when payment is not completed', async () => {
      const order = mockOrder({
        status: 'PENDING',
        downloadToken: validToken,
        downloadExpiresAt: new Date(Date.now() + 3600_000),
        product: { fileUrl: 'https://example.com/file.zip', name: 'Kit' },
      });
      (prisma.productOrder.findUnique as jest.Mock).mockResolvedValue(order);

      await expect(service.getDownloadUrl('order-1', validToken))
        .rejects
        .toThrow(BadRequestException);
    });
  });
});
