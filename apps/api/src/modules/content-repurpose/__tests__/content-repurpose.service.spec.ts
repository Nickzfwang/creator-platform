import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ContentRepurposeService } from '../content-repurpose.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

// Mock factories
const mockPrisma = () => ({
  video: { findUnique: jest.fn() },
  repurposeJob: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  repurposeItem: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  post: { create: jest.fn() },
  emailCampaign: { create: jest.fn() },
});

const mockAiService = () => ({
  generateJson: jest.fn(),
  chat: jest.fn(),
  transcribe: jest.fn(),
});

const mockQueue = () => ({
  add: jest.fn(),
});

describe('ContentRepurposeService', () => {
  let service: ContentRepurposeService;
  let prisma: ReturnType<typeof mockPrisma>;
  let aiService: ReturnType<typeof mockAiService>;
  let queue: ReturnType<typeof mockQueue>;

  beforeEach(async () => {
    prisma = mockPrisma();
    aiService = mockAiService();
    queue = mockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRepurposeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
        { provide: getQueueToken('content-repurpose'), useValue: queue },
      ],
    }).compile();

    service = module.get(ContentRepurposeService);
  });

  // ─── triggerGeneration ───

  describe('triggerGeneration', () => {
    const userId = 'user-1';
    const tenantId = 'tenant-1';
    const videoId = 'video-1';

    it('should create a new repurpose job and enqueue it', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, status: 'PROCESSED',
      });
      prisma.repurposeJob.findUnique.mockResolvedValue(null);
      prisma.repurposeJob.create.mockResolvedValue({
        id: 'job-1', videoId, userId, tenantId, status: 'PENDING',
      });

      const result = await service.triggerGeneration(videoId, userId, tenantId);

      expect(result.jobId).toBe('job-1');
      expect(result.status).toBe('PENDING');
      expect(prisma.repurposeJob.create).toHaveBeenCalledWith({
        data: { videoId, userId, tenantId, status: 'PENDING' },
      });
      expect(queue.add).toHaveBeenCalledWith(
        'generate',
        { jobId: 'job-1' },
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(
        service.triggerGeneration(videoId, userId, tenantId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not video owner', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId: 'other-user', status: 'PROCESSED',
      });

      await expect(
        service.triggerGeneration(videoId, userId, tenantId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if video not PROCESSED', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, status: 'PROCESSING',
      });

      await expect(
        service.triggerGeneration(videoId, userId, tenantId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if job is already PROCESSING', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, status: 'PROCESSED',
      });
      prisma.repurposeJob.findUnique.mockResolvedValue({
        id: 'job-1', status: 'PROCESSING',
      });

      await expect(
        service.triggerGeneration(videoId, userId, tenantId),
      ).rejects.toThrow(ConflictException);
    });

    it('should reset and re-enqueue if job already exists (COMPLETED)', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: videoId, userId, status: 'PROCESSED',
      });
      prisma.repurposeJob.findUnique.mockResolvedValue({
        id: 'job-1', status: 'COMPLETED',
      });
      prisma.repurposeJob.update.mockResolvedValue({
        id: 'job-1', status: 'PENDING',
      });

      const result = await service.triggerGeneration(videoId, userId, tenantId);

      expect(result.jobId).toBe('job-1');
      expect(prisma.repurposeItem.deleteMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1' },
      });
      expect(prisma.repurposeJob.update).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
    });
  });

  // ─── getJobByVideoId ───

  describe('getJobByVideoId', () => {
    const userId = 'user-1';
    const videoId = 'video-1';

    it('should return job with items', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: videoId, userId });
      prisma.repurposeJob.findUnique.mockResolvedValue({
        id: 'job-1',
        videoId,
        status: 'COMPLETED',
        items: [
          {
            id: 'item-1',
            type: 'SOCIAL_POST',
            originalContent: { contentText: 'hello' },
            editedContent: null,
          },
        ],
      });

      const result = await service.getJobByVideoId(videoId, userId);

      expect(result.job).toBeDefined();
      expect(result.job!.items[0].content).toEqual({ contentText: 'hello' });
    });

    it('should return editedContent as content when available', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: videoId, userId });
      prisma.repurposeJob.findUnique.mockResolvedValue({
        id: 'job-1',
        videoId,
        status: 'COMPLETED',
        items: [
          {
            id: 'item-1',
            type: 'SOCIAL_POST',
            originalContent: { contentText: 'original' },
            editedContent: { contentText: 'edited' },
          },
        ],
      });

      const result = await service.getJobByVideoId(videoId, userId);

      expect(result.job!.items[0].content).toEqual({ contentText: 'edited' });
    });

    it('should return null job if no job exists', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: videoId, userId });
      prisma.repurposeJob.findUnique.mockResolvedValue(null);

      const result = await service.getJobByVideoId(videoId, userId);
      expect(result.job).toBeNull();
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: videoId, userId: 'other' });

      await expect(
        service.getJobByVideoId(videoId, userId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── updateItem ───

  describe('updateItem', () => {
    const userId = 'user-1';
    const itemId = 'item-1';

    beforeEach(() => {
      prisma.repurposeItem.findUnique.mockResolvedValue({
        id: itemId,
        jobId: 'job-1',
        type: 'SOCIAL_POST',
        job: { userId },
      });
    });

    it('should update editedContent and set status to EDITED', async () => {
      const editedContent = { contentText: 'new text', hashtags: [] };
      prisma.repurposeItem.update.mockResolvedValue({
        id: itemId,
        status: 'EDITED',
        editedContent,
        originalContent: { contentText: 'old' },
        updatedAt: new Date(),
      });

      const result = await service.updateItem(itemId, userId, { editedContent });

      expect(result.status).toBe('EDITED');
      expect(prisma.repurposeItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: { editedContent, status: 'EDITED' },
      });
    });

    it('should set status to DISCARDED', async () => {
      prisma.repurposeItem.update.mockResolvedValue({
        id: itemId,
        status: 'DISCARDED',
        editedContent: null,
        originalContent: {},
        updatedAt: new Date(),
      });

      const result = await service.updateItem(itemId, userId, { status: 'DISCARDED' });
      expect(result.status).toBe('DISCARDED');
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.repurposeItem.findUnique.mockResolvedValue({
        id: itemId, jobId: 'job-1', job: { userId: 'other' },
      });

      await expect(
        service.updateItem(itemId, userId, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for missing item', async () => {
      prisma.repurposeItem.findUnique.mockResolvedValue(null);

      await expect(
        service.updateItem(itemId, userId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── resetItem ───

  describe('resetItem', () => {
    const userId = 'user-1';
    const itemId = 'item-1';

    it('should clear editedContent and reset status to GENERATED', async () => {
      prisma.repurposeItem.findUnique.mockResolvedValue({
        id: itemId, jobId: 'job-1', job: { userId },
      });
      prisma.repurposeItem.update.mockResolvedValue({
        id: itemId,
        status: 'GENERATED',
        originalContent: { contentText: 'original' },
        updatedAt: new Date(),
      });

      const result = await service.resetItem(itemId, userId);

      expect(result.status).toBe('GENERATED');
      expect(result.content).toEqual({ contentText: 'original' });
    });
  });

  // ─── scheduleItems ───

  describe('scheduleItems', () => {
    const userId = 'user-1';
    const tenantId = 'tenant-1';

    it('should create posts and update item status to SCHEDULED', async () => {
      prisma.repurposeItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          type: 'SOCIAL_POST',
          status: 'GENERATED',
          platform: 'YOUTUBE',
          editedContent: null,
          originalContent: { contentText: 'YT post', hashtags: ['#test'] },
          job: { userId, tenantId },
        },
      ]);
      prisma.post.create.mockResolvedValue({
        id: 'post-1', status: 'DRAFT',
      });
      prisma.repurposeItem.update.mockResolvedValue({});

      const result = await service.scheduleItems(userId, tenantId, {
        itemIds: ['item-1'],
      });

      expect(result.scheduled).toHaveLength(1);
      expect(result.scheduled[0].postId).toBe('post-1');
      expect(result.failed).toHaveLength(0);
    });

    it('should skip DISCARDED items', async () => {
      prisma.repurposeItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          type: 'SOCIAL_POST',
          status: 'DISCARDED',
          platform: 'YOUTUBE',
          originalContent: {},
          job: { userId, tenantId },
        },
      ]);

      const result = await service.scheduleItems(userId, tenantId, {
        itemIds: ['item-1'],
      });

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).toContain('discarded');
    });

    it('should throw BadRequestException if no valid items', async () => {
      prisma.repurposeItem.findMany.mockResolvedValue([]);

      await expect(
        service.scheduleItems(userId, tenantId, { itemIds: ['item-1'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create SCHEDULED post when scheduledAt provided', async () => {
      const scheduledAt = '2026-04-01T10:00:00Z';
      prisma.repurposeItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          type: 'SOCIAL_POST',
          status: 'GENERATED',
          platform: 'INSTAGRAM',
          editedContent: null,
          originalContent: { contentText: 'IG post', hashtags: [] },
          job: { userId, tenantId },
        },
      ]);
      prisma.post.create.mockResolvedValue({ id: 'post-1', status: 'SCHEDULED' });
      prisma.repurposeItem.update.mockResolvedValue({});

      const result = await service.scheduleItems(userId, tenantId, {
        itemIds: ['item-1'],
        scheduledAt,
      });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SCHEDULED',
            scheduledAt: new Date(scheduledAt),
          }),
        }),
      );
      expect(result.scheduled).toHaveLength(1);
    });
  });

  // ─── createCampaignFromItem ───

  describe('createCampaignFromItem', () => {
    const userId = 'user-1';
    const tenantId = 'tenant-1';
    const itemId = 'item-1';

    it('should create email campaign from EMAIL item', async () => {
      prisma.repurposeItem.findUnique.mockResolvedValue({
        id: itemId,
        type: 'EMAIL',
        jobId: 'job-1',
        editedContent: null,
        originalContent: {
          subject: 'Test Subject',
          body: '<p>Hello</p>',
          plainText: 'Hello',
          ctaText: '觀看',
          ctaUrl: '{{VIDEO_URL}}',
        },
        job: { userId },
      });
      prisma.emailCampaign.create.mockResolvedValue({
        id: 'campaign-1', status: 'DRAFT',
      });
      prisma.repurposeItem.update.mockResolvedValue({});

      const result = await service.createCampaignFromItem(
        itemId, userId, tenantId, {},
      );

      expect(result.campaignId).toBe('campaign-1');
      expect(prisma.emailCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            tenantId,
            type: 'SINGLE',
          }),
        }),
      );
    });

    it('should throw BadRequestException for non-EMAIL item', async () => {
      prisma.repurposeItem.findUnique.mockResolvedValue({
        id: itemId,
        type: 'SOCIAL_POST',
        jobId: 'job-1',
        job: { userId },
      });

      await expect(
        service.createCampaignFromItem(itemId, userId, tenantId, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── processGeneration ───

  describe('processGeneration', () => {
    it('should generate items and mark job as COMPLETED', async () => {
      const jobId = 'job-1';
      prisma.repurposeJob.findUnique.mockResolvedValue({
        id: jobId,
        video: {
          id: 'video-1',
          title: 'Test Video',
          aiSummary: 'A test summary',
          transcript: 'Hello world transcript text',
          durationSeconds: 120,
        },
      });
      prisma.repurposeJob.update.mockResolvedValue({});

      // Mock AI responses
      aiService.generateJson
        .mockResolvedValueOnce({
          posts: [
            { style: 'knowledge', contentText: 'YT post', hashtags: ['#test'] },
            { style: 'story', contentText: 'YT story', hashtags: [] },
            { style: 'interactive', contentText: 'YT interactive', hashtags: [] },
          ],
        }) // YouTube
        .mockResolvedValueOnce({ posts: [{ style: 'knowledge', contentText: 'IG', hashtags: [] }] }) // Instagram
        .mockResolvedValueOnce({ posts: [{ style: 'knowledge', contentText: 'FB', hashtags: [] }] }) // Facebook
        .mockResolvedValueOnce({ posts: [{ style: 'knowledge', contentText: 'TW', hashtags: [] }] }) // Twitter
        .mockResolvedValueOnce({ posts: [{ style: 'knowledge', contentText: 'TH', hashtags: [] }] }) // Threads
        .mockResolvedValueOnce({
          suggestions: [
            { title: 'Clip 1', startTime: 10, endTime: 40, transcriptExcerpt: 'text', reason: '金句', suggestedPlatforms: ['YOUTUBE'], score: 0.9 },
          ],
        }) // Short video suggestions
        .mockResolvedValueOnce({
          subject: 'New video', body: '<p>Hi</p>', plainText: 'Hi', ctaText: '觀看', ctaUrl: '{{VIDEO_URL}}',
        }); // Email

      prisma.repurposeItem.createMany.mockResolvedValue({ count: 8 });

      await service.processGeneration(jobId);

      expect(prisma.repurposeJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(prisma.repurposeItem.createMany).toHaveBeenCalled();
    });

    it('should still complete when AI calls fail (Promise.allSettled)', async () => {
      const jobId = 'job-1';
      prisma.repurposeJob.findUnique.mockResolvedValue({
        id: jobId,
        video: {
          id: 'video-1', title: 'Test', aiSummary: null, transcript: null, durationSeconds: 10,
        },
      });
      prisma.repurposeJob.update.mockResolvedValue({});

      // All AI calls fail — but Promise.allSettled handles gracefully
      aiService.generateJson.mockRejectedValue(new Error('API error'));

      await service.processGeneration(jobId);

      // Should still mark as COMPLETED (with 0 items, createMany not called)
      expect(prisma.repurposeItem.createMany).not.toHaveBeenCalled();
      expect(prisma.repurposeJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('should mark job as FAILED on database error', async () => {
      const jobId = 'job-1';
      prisma.repurposeJob.findUnique.mockResolvedValue({
        id: jobId,
        video: {
          id: 'video-1', title: 'Test', aiSummary: null, transcript: null, durationSeconds: 10,
        },
      });
      prisma.repurposeJob.update
        .mockResolvedValueOnce({}) // PROCESSING status update
        .mockResolvedValueOnce({}); // FAILED status update

      // AI succeeds but createMany fails
      aiService.generateJson.mockResolvedValue({
        posts: [{ style: 'knowledge', contentText: 'text', hashtags: [] }],
      });
      prisma.repurposeItem.createMany.mockRejectedValue(new Error('DB error'));

      await expect(service.processGeneration(jobId)).rejects.toThrow('DB error');

      expect(prisma.repurposeJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('should throw NotFoundException for missing job', async () => {
      prisma.repurposeJob.findUnique.mockResolvedValue(null);

      await expect(service.processGeneration('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
