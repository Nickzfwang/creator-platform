import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { EmailMarketingService } from '../email-marketing.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

describe('EmailMarketingService', () => {
  let service: EmailMarketingService;
  let prisma: jest.Mocked<PrismaService>;
  let emailQueue: { add: jest.Mock };

  const mockUserId = '00000000-0000-0000-0000-000000000001';
  const mockTenantId = 'tenant-001';
  const mockCampaignId = 'campaign-001';

  const mockSubscribers = [
    { id: 'sub-1', email: 'alice@example.com', name: 'Alice' },
    { id: 'sub-2', email: 'bob@example.com', name: 'Bob' },
  ];

  const mockSingleCampaign = (overrides: Partial<any> = {}) => ({
    id: mockCampaignId,
    userId: mockUserId,
    tenantId: mockTenantId,
    name: 'Test Campaign',
    type: 'SINGLE',
    status: 'DRAFT',
    targetTags: [],
    emails: [
      { id: 'email-1', subject: 'Hello!', body: '<p>Hi {{name}}</p>', sortOrder: 0, delayDays: 0 },
    ],
    ...overrides,
  });

  const mockSequenceCampaign = (overrides: Partial<any> = {}) => ({
    id: mockCampaignId,
    userId: mockUserId,
    tenantId: mockTenantId,
    name: 'Sequence Campaign',
    type: 'SEQUENCE',
    status: 'DRAFT',
    targetTags: [],
    emails: [
      { id: 'email-1', subject: 'Welcome', body: '<p>Welcome!</p>', sortOrder: 0, delayDays: 0 },
      { id: 'email-2', subject: 'Value', body: '<p>Free tips</p>', sortOrder: 1, delayDays: 3 },
      { id: 'email-3', subject: 'Offer', body: '<p>Buy now</p>', sortOrder: 2, delayDays: 7 },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    emailQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailMarketingService,
        {
          provide: PrismaService,
          useValue: {
            emailCampaign: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            emailSubscriber: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: AiService,
          useValue: {
            generateJson: jest.fn(),
            chat: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                UNSUBSCRIBE_SECRET: 'test-unsub-secret',
                API_URL: 'http://localhost:4000',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: getQueueToken('email-send'),
          useValue: emailQueue,
        },
      ],
    }).compile();

    service = module.get(EmailMarketingService);
    prisma = module.get(PrismaService);
  });

  // ─── sendCampaign ───

  describe('sendCampaign', () => {
    it('SINGLE campaign — should query active subscribers, update status to SENDING, add one job to queue', async () => {
      const campaign = mockSingleCampaign();
      (prisma.emailCampaign.findUnique as jest.Mock).mockResolvedValue(campaign);
      (prisma.emailSubscriber.findMany as jest.Mock).mockResolvedValue(mockSubscribers);
      (prisma.emailCampaign.update as jest.Mock).mockResolvedValue({ ...campaign, status: 'SENDING' });

      const result = await service.sendCampaign(mockCampaignId, mockUserId, mockTenantId);

      expect(result).toEqual({ queued: true, subscriberCount: 2, emailCount: 1 });
      expect(prisma.emailCampaign.update).toHaveBeenCalledWith({
        where: { id: mockCampaignId },
        data: { status: 'SENDING' },
      });
      expect(emailQueue.add).toHaveBeenCalledTimes(1);
      expect(emailQueue.add).toHaveBeenCalledWith(
        'send-campaign',
        expect.objectContaining({
          campaignId: mockCampaignId,
          subject: 'Hello!',
          subscribers: mockSubscribers,
        }),
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('SEQUENCE campaign with 3 emails — should add 3 jobs (first immediate, 2nd/3rd with delay)', async () => {
      const campaign = mockSequenceCampaign();
      (prisma.emailCampaign.findUnique as jest.Mock).mockResolvedValue(campaign);
      (prisma.emailSubscriber.findMany as jest.Mock).mockResolvedValue(mockSubscribers);
      (prisma.emailCampaign.update as jest.Mock).mockResolvedValue({ ...campaign, status: 'SENDING' });

      const result = await service.sendCampaign(mockCampaignId, mockUserId, mockTenantId);

      expect(result).toEqual({ queued: true, subscriberCount: 2, emailCount: 3 });
      expect(emailQueue.add).toHaveBeenCalledTimes(3);

      // First email — no delay
      expect(emailQueue.add).toHaveBeenNthCalledWith(
        1,
        'send-campaign',
        expect.objectContaining({ subject: 'Welcome' }),
        expect.not.objectContaining({ delay: expect.any(Number) }),
      );

      // Second email — 3 days delay
      expect(emailQueue.add).toHaveBeenNthCalledWith(
        2,
        'send-campaign',
        expect.objectContaining({ subject: 'Value' }),
        expect.objectContaining({ delay: 3 * 24 * 60 * 60 * 1000 }),
      );

      // Third email — 7 days delay
      expect(emailQueue.add).toHaveBeenNthCalledWith(
        3,
        'send-campaign',
        expect.objectContaining({ subject: 'Offer' }),
        expect.objectContaining({ delay: 7 * 24 * 60 * 60 * 1000 }),
      );
    });

    it('campaign already SENT — should throw BadRequestException', async () => {
      const campaign = mockSingleCampaign({ status: 'SENT' });
      (prisma.emailCampaign.findUnique as jest.Mock).mockResolvedValue(campaign);

      await expect(
        service.sendCampaign(mockCampaignId, mockUserId, mockTenantId),
      ).rejects.toThrow(BadRequestException);

      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('no matching subscribers — should throw BadRequestException', async () => {
      const campaign = mockSingleCampaign();
      (prisma.emailCampaign.findUnique as jest.Mock).mockResolvedValue(campaign);
      (prisma.emailSubscriber.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        service.sendCampaign(mockCampaignId, mockUserId, mockTenantId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.emailCampaign.update).not.toHaveBeenCalled();
      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('tag filtering — when campaign has targetTags, should filter subscribers by hasSome', async () => {
      const campaign = mockSingleCampaign({ targetTags: ['vip', 'early-bird'] });
      (prisma.emailCampaign.findUnique as jest.Mock).mockResolvedValue(campaign);
      (prisma.emailSubscriber.findMany as jest.Mock).mockResolvedValue(mockSubscribers);
      (prisma.emailCampaign.update as jest.Mock).mockResolvedValue({ ...campaign, status: 'SENDING' });

      await service.sendCampaign(mockCampaignId, mockUserId, mockTenantId);

      expect(prisma.emailSubscriber.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          isActive: true,
          tags: { hasSome: ['vip', 'early-bird'] },
        },
        select: { id: true, email: true, name: true },
      });
    });
  });

  // ─── Unsubscribe ───

  describe('processUnsubscribe', () => {
    it('valid token — sets isActive=false', async () => {
      const subscriberId = 'sub-1';
      const token = service.generateUnsubscribeToken(subscriberId);

      (prisma.emailSubscriber.findUnique as jest.Mock).mockResolvedValue({
        id: subscriberId,
        email: 'alice@example.com',
        isActive: true,
      });
      (prisma.emailSubscriber.update as jest.Mock).mockResolvedValue({
        id: subscriberId,
        isActive: false,
      });

      const result = await service.processUnsubscribe(subscriberId, token);

      expect(result).toEqual({ unsubscribed: true, email: 'alice@example.com' });
      expect(prisma.emailSubscriber.update).toHaveBeenCalledWith({
        where: { id: subscriberId },
        data: { isActive: false },
      });
    });

    it('invalid token — throws BadRequestException', async () => {
      await expect(
        service.processUnsubscribe('sub-1', 'bad-token-value'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.emailSubscriber.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('generateUnsubscribeToken / verifyUnsubscribeToken', () => {
    it('token is consistent and verifiable', () => {
      const subscriberId = 'sub-42';

      const token1 = service.generateUnsubscribeToken(subscriberId);
      const token2 = service.generateUnsubscribeToken(subscriberId);

      // Deterministic — same input produces same output
      expect(token1).toBe(token2);
      expect(token1).toHaveLength(32);

      // Verifiable
      expect(service.verifyUnsubscribeToken(subscriberId, token1)).toBe(true);

      // Different subscriber produces different token
      const otherToken = service.generateUnsubscribeToken('sub-99');
      expect(otherToken).not.toBe(token1);
      expect(service.verifyUnsubscribeToken(subscriberId, otherToken)).toBe(false);
    });
  });
});
