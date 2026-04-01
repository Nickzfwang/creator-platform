import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { PostStatus, PostType } from '@prisma/client';
import { PostSchedulerService } from '../post-scheduler.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

describe('PostSchedulerService', () => {
  let service: PostSchedulerService;
  let prisma: jest.Mocked<PrismaService>;
  let publishQueue: { add: jest.Mock; remove: jest.Mock };

  const userId = 'user-1';
  const tenantId = 'tenant-1';

  const mockPost = (overrides: Partial<any> = {}) => ({
    id: 'post-1',
    userId,
    tenantId,
    contentText: 'Hello world!',
    mediaUrls: [],
    clipId: null,
    platforms: [{ platform: 'YOUTUBE', enabled: true }],
    type: PostType.ORIGINAL,
    status: PostStatus.DRAFT,
    hashtags: ['#test'],
    affiliateLinks: [],
    scheduledAt: null,
    publishedAt: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    ...overrides,
  });

  beforeEach(async () => {
    publishQueue = { add: jest.fn().mockResolvedValue({}), remove: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostSchedulerService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            videoClip: { findUnique: jest.fn() },
          },
        },
        {
          provide: AiService,
          useValue: { generateJson: jest.fn() },
        },
        {
          provide: getQueueToken('post-publish'),
          useValue: publishQueue,
        },
      ],
    }).compile();

    service = module.get(PostSchedulerService);
    prisma = module.get(PrismaService);
  });

  // ─── create ───

  describe('create', () => {
    it('should create a DRAFT post when no scheduledAt', async () => {
      const created = mockPost();
      (prisma.post.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(userId, tenantId, {
        contentText: 'Hello world!',
        platforms: [{ platform: 'YOUTUBE', enabled: true }] as any,
      });

      expect(result.status).toBe(PostStatus.DRAFT);
      expect(prisma.post.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: PostStatus.DRAFT }),
      });
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    it('should create a SCHEDULED post and add BullMQ job', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const created = mockPost({ status: PostStatus.SCHEDULED, scheduledAt: new Date(futureDate) });
      (prisma.post.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(userId, tenantId, {
        contentText: 'Scheduled post',
        platforms: [{ platform: 'YOUTUBE', enabled: true }] as any,
        scheduledAt: futureDate,
      });

      expect(result.status).toBe(PostStatus.SCHEDULED);
      expect(publishQueue.add).toHaveBeenCalledWith(
        'publish',
        { postId: 'post-1' },
        expect.objectContaining({
          delay: expect.any(Number),
          jobId: 'post-post-1',
          attempts: 3,
        }),
      );
    });

    it('should throw BadRequestException for past scheduledAt', async () => {
      await expect(
        service.create(userId, tenantId, {
          contentText: 'test',
          platforms: [] as any,
          scheduledAt: '2020-01-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate clipId belongs to tenant', async () => {
      (prisma.videoClip.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(userId, tenantId, {
          contentText: 'test',
          platforms: [] as any,
          clipId: 'clip-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publishNow ───

  describe('publishNow', () => {
    it('should queue DRAFT post for immediate publishing', async () => {
      const post = mockPost({ status: PostStatus.DRAFT });
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(post);
      (prisma.post.update as jest.Mock).mockResolvedValue({ ...post, status: PostStatus.PUBLISHING });

      const result = await service.publishNow('post-1', userId);

      expect(result.status).toBe('PUBLISHING');
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { status: PostStatus.PUBLISHING },
      });
      expect(publishQueue.add).toHaveBeenCalledWith(
        'publish',
        { postId: 'post-1' },
        expect.objectContaining({ jobId: 'post-post-1-now' }),
      );
    });

    it('should throw BadRequestException for PUBLISHED post', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(
        mockPost({ status: PostStatus.PUBLISHED }),
      );

      await expect(service.publishNow('post-1', userId)).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for another user\'s post', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(
        mockPost({ userId: 'other-user' }),
      );

      await expect(service.publishNow('post-1', userId)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── remove ───

  describe('remove', () => {
    it('should delete DRAFT post', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost());

      await service.remove('post-1', userId);

      expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } });
    });

    it('should remove BullMQ job when deleting SCHEDULED post', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(
        mockPost({ status: PostStatus.SCHEDULED }),
      );

      await service.remove('post-1', userId);

      expect(publishQueue.remove).toHaveBeenCalledWith('post-post-1');
      expect(prisma.post.delete).toHaveBeenCalled();
    });

    it('should throw BadRequestException for PUBLISHED post', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(
        mockPost({ status: PostStatus.PUBLISHED }),
      );

      await expect(service.remove('post-1', userId)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ───

  describe('update', () => {
    it('should reschedule BullMQ job when scheduledAt changes', async () => {
      const post = mockPost({ status: PostStatus.DRAFT });
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(post);
      (prisma.post.update as jest.Mock).mockResolvedValue({ ...post, status: PostStatus.SCHEDULED });

      const futureDate = new Date(Date.now() + 86400000).toISOString();
      await service.update('post-1', userId, { scheduledAt: futureDate });

      expect(publishQueue.remove).toHaveBeenCalledWith('post-post-1');
      expect(publishQueue.add).toHaveBeenCalledWith(
        'publish',
        { postId: 'post-1' },
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('should throw BadRequestException for PUBLISHED post', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(
        mockPost({ status: PostStatus.PUBLISHED }),
      );

      await expect(
        service.update('post-1', userId, { contentText: 'updated' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
