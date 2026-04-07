import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LandingPageService } from '../landing-page.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';

const mockPrisma = () => ({
  landingPage: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const mockAiService = () => ({
  generateJson: jest.fn(),
});

describe('LandingPageService', () => {
  let service: LandingPageService;
  let prisma: ReturnType<typeof mockPrisma>;
  let ai: ReturnType<typeof mockAiService>;

  const makePage = (overrides: Record<string, unknown> = {}) => ({
    id: 'page-1', userId: 'user-1', tenantId: 'tenant-1', slug: 'my-page',
    title: 'Test Page', headline: 'Welcome', subheadline: 'Creator',
    bio: 'Bio text', theme: 'modern', colorScheme: {}, socialLinks: [],
    ctaButtons: [], sections: [], isPublished: false, viewCount: 0,
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  });

  beforeEach(async () => {
    prisma = mockPrisma();
    ai = mockAiService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandingPageService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(LandingPageService);
  });

  describe('aiGenerate', () => {
    it('should create page with AI-generated content', async () => {
      ai.generateJson.mockResolvedValue({
        headline: 'AI 標題', subheadline: '副標', bio: 'AI bio',
        ctaButtons: [{ label: '訂閱', url: '#' }],
        sections: [{ type: 'hero', title: 'Hero' }],
        colorScheme: { primary: '#000' }, theme: 'bold',
      });
      prisma.landingPage.findUnique.mockResolvedValue(null); // slug available
      prisma.landingPage.create.mockImplementation(({ data }) => Promise.resolve({ id: 'page-1', ...data, createdAt: new Date(), updatedAt: new Date() }));

      const result = await service.aiGenerate('user-1', 'tenant-1', {
        creatorName: 'TestCreator', niche: '科技',
      });

      expect(result.headline).toBe('AI 標題');
      expect(result.isPublished).toBe(false);
    });

    it('should use fallback values when AI returns null', async () => {
      ai.generateJson.mockResolvedValue(null);
      prisma.landingPage.findUnique.mockResolvedValue(null);
      prisma.landingPage.create.mockImplementation(({ data }) => Promise.resolve({ id: 'page-1', ...data, createdAt: new Date(), updatedAt: new Date() }));

      const result = await service.aiGenerate('user-1', 'tenant-1', {
        creatorName: 'Creator', niche: '美食',
      });

      expect(result.headline).toContain('Creator');
      expect(result.theme).toBe('modern');
    });

    it('should generate unique slug with counter on collision', async () => {
      ai.generateJson.mockResolvedValue(null);
      prisma.landingPage.findUnique
        .mockResolvedValueOnce({ id: 'existing' }) // 'creator' taken
        .mockResolvedValueOnce(null); // 'creator-1' available
      prisma.landingPage.create.mockImplementation(({ data }) => Promise.resolve({ id: 'page-1', ...data, createdAt: new Date(), updatedAt: new Date() }));

      const result = await service.aiGenerate('user-1', 'tenant-1', {
        creatorName: 'Creator', niche: '科技',
      });

      expect(result.slug).toBe('creator-1');
    });
  });

  describe('getByUser', () => {
    it('should return most recent page', async () => {
      prisma.landingPage.findFirst.mockResolvedValue(makePage());
      const result = await service.getByUser('user-1');
      expect(result!.id).toBe('page-1');
    });

    it('should return null if no page exists', async () => {
      prisma.landingPage.findFirst.mockResolvedValue(null);
      const result = await service.getByUser('user-1');
      expect(result).toBeNull();
    });
  });

  describe('getBySlug', () => {
    it('should return published page and increment viewCount', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(makePage({ isPublished: true }));
      prisma.landingPage.update.mockResolvedValue(makePage({ viewCount: 1 }));

      const result = await service.getBySlug('my-page');

      expect(result.id).toBe('page-1');
      expect(prisma.landingPage.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { viewCount: { increment: 1 } } }),
      );
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(null);
      await expect(service.getBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if not published', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(makePage({ isPublished: false }));
      await expect(service.getBySlug('my-page')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update partial fields', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(makePage());
      prisma.landingPage.update.mockResolvedValue(makePage({ headline: 'New Title' }));

      const result = await service.update('page-1', 'user-1', { headline: 'New Title' });
      expect(result.headline).toBe('New Title');
    });

    it('should throw NotFoundException if not owner', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(makePage({ userId: 'other' }));
      await expect(service.update('page-1', 'user-1', { headline: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if page not found', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(null);
      await expect(service.update('page-x', 'user-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('aiRegenerateSection', () => {
    it('should return AI-generated section', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(makePage());
      ai.generateJson.mockResolvedValue({ title: 'FAQ', content: '常見問題', items: [] });

      const result = await service.aiRegenerateSection('page-1', 'user-1', 'faq');

      expect(result?.title).toBe('FAQ');
    });

    it('should throw NotFoundException if not owner', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(makePage({ userId: 'other' }));
      await expect(service.aiRegenerateSection('page-1', 'user-1', 'hero')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete page', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(makePage());

      const result = await service.delete('page-1', 'user-1');

      expect(result.deleted).toBe(true);
      expect(prisma.landingPage.delete).toHaveBeenCalledWith({ where: { id: 'page-1' } });
    });

    it('should throw NotFoundException if not owner', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(makePage({ userId: 'other' }));
      await expect(service.delete('page-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
