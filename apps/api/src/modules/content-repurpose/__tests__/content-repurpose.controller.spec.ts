import { Test, TestingModule } from '@nestjs/testing';
import { ContentRepurposeController } from '../content-repurpose.controller';
import { ContentRepurposeService } from '../content-repurpose.service';

const mockService = () => ({
  getJobByVideoId: jest.fn(),
  triggerGeneration: jest.fn(),
  updateItem: jest.fn(),
  resetItem: jest.fn(),
  regenerateItem: jest.fn(),
  scheduleItems: jest.fn(),
  createCampaignFromItem: jest.fn(),
});

describe('ContentRepurposeController', () => {
  let controller: ContentRepurposeController;
  let service: ReturnType<typeof mockService>;

  beforeEach(async () => {
    service = mockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentRepurposeController],
      providers: [
        { provide: ContentRepurposeService, useValue: service },
      ],
    }).compile();

    controller = module.get(ContentRepurposeController);
  });

  describe('getJobByVideoId', () => {
    it('should call service.getJobByVideoId with correct params', async () => {
      service.getJobByVideoId.mockResolvedValue({ job: null });

      const result = await controller.getJobByVideoId('video-1', 'user-1');

      expect(service.getJobByVideoId).toHaveBeenCalledWith('video-1', 'user-1');
      expect(result).toEqual({ job: null });
    });
  });

  describe('triggerGeneration', () => {
    it('should call service.triggerGeneration with correct params', async () => {
      service.triggerGeneration.mockResolvedValue({
        jobId: 'job-1', status: 'PENDING', message: 'ok',
      });

      const result = await controller.triggerGeneration('video-1', 'user-1', 'tenant-1');

      expect(service.triggerGeneration).toHaveBeenCalledWith('video-1', 'user-1', 'tenant-1');
      expect(result.jobId).toBe('job-1');
    });
  });

  describe('updateItem', () => {
    it('should call service.updateItem with correct params', async () => {
      const dto = { editedContent: { contentText: 'new' } };
      service.updateItem.mockResolvedValue({ id: 'item-1', status: 'EDITED' });

      const result = await controller.updateItem('item-1', 'user-1', dto);

      expect(service.updateItem).toHaveBeenCalledWith('item-1', 'user-1', dto);
      expect(result.status).toBe('EDITED');
    });
  });

  describe('resetItem', () => {
    it('should call service.resetItem with correct params', async () => {
      service.resetItem.mockResolvedValue({ id: 'item-1', status: 'GENERATED' });

      const result = await controller.resetItem('item-1', 'user-1');

      expect(service.resetItem).toHaveBeenCalledWith('item-1', 'user-1');
      expect(result.status).toBe('GENERATED');
    });
  });

  describe('regenerateItem', () => {
    it('should call service.regenerateItem with correct params', async () => {
      service.regenerateItem.mockResolvedValue({ id: 'item-1', status: 'GENERATED' });

      const result = await controller.regenerateItem('item-1', 'user-1');

      expect(service.regenerateItem).toHaveBeenCalledWith('item-1', 'user-1');
    });
  });

  describe('scheduleItems', () => {
    it('should call service.scheduleItems with correct params', async () => {
      const dto = { itemIds: ['item-1', 'item-2'] };
      service.scheduleItems.mockResolvedValue({
        scheduled: [{ itemId: 'item-1', postId: 'post-1' }],
        failed: [],
      });

      const result = await controller.scheduleItems('user-1', 'tenant-1', dto);

      expect(service.scheduleItems).toHaveBeenCalledWith('user-1', 'tenant-1', dto);
      expect(result.scheduled).toHaveLength(1);
    });
  });

  describe('createCampaign', () => {
    it('should call service.createCampaignFromItem with correct params', async () => {
      const dto = { targetTags: ['vip'] };
      service.createCampaignFromItem.mockResolvedValue({
        itemId: 'item-1', campaignId: 'campaign-1', status: 'DRAFT',
      });

      const result = await controller.createCampaign('item-1', 'user-1', 'tenant-1', dto);

      expect(service.createCampaignFromItem).toHaveBeenCalledWith(
        'item-1', 'user-1', 'tenant-1', dto,
      );
      expect(result.campaignId).toBe('campaign-1');
    });
  });
});
