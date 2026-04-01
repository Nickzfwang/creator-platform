import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage.service';

// Mock AWS SDK
const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

describe('StorageService', () => {
  let service: StorageService;

  const buildService = async (configOverrides: Record<string, string | undefined> = {}) => {
    const defaults: Record<string, string> = {
      STORAGE_ENDPOINT: 'http://localhost:9000',
      STORAGE_ACCESS_KEY: 'minioadmin',
      STORAGE_SECRET_KEY: 'minioadmin',
      STORAGE_BUCKET: 'test-bucket',
      STORAGE_REGION: 'auto',
    };
    const config = { ...defaults, ...configOverrides };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => config[key] ?? defaultValue),
          },
        },
      ],
    }).compile();

    return module.get(StorageService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildService();
  });

  it('should be configured when all env vars are provided', () => {
    expect(service.isConfigured).toBe(true);
    expect(service.bucket).toBe('test-bucket');
  });

  it('should not be configured when credentials are missing', async () => {
    const unconfigured = await buildService({
      STORAGE_ENDPOINT: undefined,
      STORAGE_ACCESS_KEY: undefined,
      STORAGE_SECRET_KEY: undefined,
    });
    expect(unconfigured.isConfigured).toBe(false);
  });

  describe('getUploadUrl', () => {
    it('should generate a presigned PUT URL', async () => {
      mockGetSignedUrl.mockResolvedValue('https://minio:9000/test-bucket/key?signed');

      const url = await service.getUploadUrl('videos/test.mp4', 'video/mp4', 3600);

      expect(url).toBe('https://minio:9000/test-bucket/key?signed');
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'videos/test.mp4',
            ContentType: 'video/mp4',
          }),
        }),
        { expiresIn: 3600 },
      );
    });
  });

  describe('getPublicUrl', () => {
    it('should use STORAGE_PUBLIC_URL when set', async () => {
      const withPublic = await buildService({ STORAGE_PUBLIC_URL: 'https://cdn.example.com' });
      const url = await withPublic.getPublicUrl('videos/test.mp4');
      expect(url).toBe('https://cdn.example.com/videos/test.mp4');
    });

    it('should fall back to presigned URL when STORAGE_PUBLIC_URL not set', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed-url');
      const url = await service.getPublicUrl('videos/test.mp4');
      expect(url).toBe('https://signed-url');
    });
  });

  describe('exists', () => {
    it('should return true when object exists', async () => {
      mockSend.mockResolvedValue({});
      expect(await service.exists('videos/test.mp4')).toBe(true);
    });

    it('should return false when object does not exist', async () => {
      mockSend.mockRejectedValue(new Error('NotFound'));
      expect(await service.exists('videos/missing.mp4')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should send DeleteObjectCommand', async () => {
      mockSend.mockResolvedValue({});
      await service.delete('videos/test.mp4');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'videos/test.mp4',
          }),
        }),
      );
    });
  });

  describe('unconfigured service', () => {
    it('should throw when calling methods without configuration', async () => {
      const unconfigured = await buildService({
        STORAGE_ENDPOINT: undefined,
        STORAGE_ACCESS_KEY: undefined,
        STORAGE_SECRET_KEY: undefined,
      });

      await expect(unconfigured.getUploadUrl('key', 'type')).rejects.toThrow('Storage is not configured');
      await expect(unconfigured.exists('key')).rejects.toThrow('Storage is not configured');
      await expect(unconfigured.delete('key')).rejects.toThrow('Storage is not configured');
    });
  });
});
