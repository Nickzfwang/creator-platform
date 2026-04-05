import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiGatewayService } from '../api-gateway.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

const mockPrisma = () => ({
  tenant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
});

const mockRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
});

describe('ApiGatewayService', () => {
  let service: ApiGatewayService;
  let prisma: ReturnType<typeof mockPrisma>;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    prisma = mockPrisma();
    redis = mockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiGatewayService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(ApiGatewayService);
  });

  const makeTenant = (overrides: Record<string, unknown> = {}) => ({
    id: 'tenant-1',
    settings: {},
    plan: 'FREE',
    ...overrides,
  });

  // ─── API Key Management ───

  describe('createApiKey', () => {
    it('should create an API key and return raw key only once', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());

      const result = await service.createApiKey('user-1', 'tenant-1', { name: 'Test Key' });

      expect(result.key).toMatch(/^cpk_/);
      expect(result.name).toBe('Test Key');
      expect(result.keyPrefix).toBe(result.key.substring(0, 8));
      expect(result.scopes).toEqual(['read', 'write']);
      expect(result.id).toBeDefined();
      expect(prisma.tenant.update).toHaveBeenCalled();
    });

    it('should use custom scopes when provided', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());

      const result = await service.createApiKey('user-1', 'tenant-1', {
        name: 'Read Only',
        scopes: ['read'],
      });

      expect(result.scopes).toEqual(['read']);
    });

    it('should throw when 10 active keys already exist', async () => {
      const apiKeys = Array.from({ length: 10 }, (_, i) => ({
        id: `key-${i}`, name: `Key ${i}`, keyHash: `hash-${i}`, keyPrefix: `cpk_${i}`,
        scopes: ['read'], createdAt: new Date().toISOString(), lastUsedAt: null, isActive: true,
      }));
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { apiKeys } }));

      await expect(
        service.createApiKey('user-1', 'tenant-1', { name: 'Overflow' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow creating keys if some existing keys are revoked', async () => {
      const apiKeys = Array.from({ length: 10 }, (_, i) => ({
        id: `key-${i}`, name: `Key ${i}`, keyHash: `hash-${i}`, keyPrefix: `cpk_${i}`,
        scopes: ['read'], createdAt: new Date().toISOString(), lastUsedAt: null,
        isActive: i < 9, // 9 active, 1 revoked
      }));
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { apiKeys } }));

      const result = await service.createApiKey('user-1', 'tenant-1', { name: 'New Key' });
      expect(result.key).toMatch(/^cpk_/);
    });

    it('should throw if tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.createApiKey('user-1', 'tenant-x', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listApiKeys', () => {
    it('should return keys without keyHash or raw key', async () => {
      const apiKeys = [{
        id: 'key-1', name: 'My Key', keyHash: 'secret-hash', keyPrefix: 'cpk_abcd',
        scopes: ['read', 'write'], createdAt: '2026-01-01T00:00:00Z',
        lastUsedAt: null, isActive: true,
      }];
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { apiKeys } }));

      const result = await service.listApiKeys('tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('keyHash');
      expect(result[0]).not.toHaveProperty('key');
      expect(result[0].id).toBe('key-1');
      expect(result[0].keyPrefix).toBe('cpk_abcd');
    });

    it('should return empty array when no keys exist', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());

      const result = await service.listApiKeys('tenant-1');
      expect(result).toEqual([]);
    });
  });

  describe('revokeApiKey', () => {
    it('should mark key as inactive', async () => {
      const apiKeys = [{
        id: 'key-1', name: 'My Key', keyHash: 'hash', keyPrefix: 'cpk_',
        scopes: ['read'], createdAt: '2026-01-01T00:00:00Z',
        lastUsedAt: null, isActive: true,
      }];
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { apiKeys } }));

      await service.revokeApiKey('tenant-1', 'key-1');

      const updateCall = prisma.tenant.update.mock.calls[0][0];
      const updatedSettings = updateCall.data.settings as { apiKeys: Array<{ isActive: boolean }> };
      expect(updatedSettings.apiKeys[0].isActive).toBe(false);
    });

    it('should throw NotFoundException for unknown key', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { apiKeys: [] } }));

      await expect(service.revokeApiKey('tenant-1', 'key-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateApiKey', () => {
    it('should return cached result if available', async () => {
      const cached = { tenantId: 'tenant-1', scopes: ['read'] };
      redis.get.mockResolvedValue(cached);

      const result = await service.validateApiKey('cpk_testkey');

      expect(result).toEqual(cached);
      expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    });

    it('should validate key against all tenants and cache result', async () => {
      redis.get.mockResolvedValue(null);

      // We need a real hash — create a known key and compute its hash
      const { createHash } = require('crypto');
      const rawKey = 'cpk_test123';
      const keyHash = createHash('sha256').update(rawKey).digest('hex');

      prisma.tenant.findMany.mockResolvedValue([{
        id: 'tenant-1',
        settings: {
          apiKeys: [{
            id: 'key-1', name: 'Test', keyHash, keyPrefix: 'cpk_test',
            scopes: ['read', 'write'], createdAt: '2026-01-01T00:00:00Z',
            lastUsedAt: null, isActive: true,
          }],
        },
      }]);

      const result = await service.validateApiKey(rawKey);

      expect(result).toEqual({ tenantId: 'tenant-1', scopes: ['read', 'write'] });
      expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('apikey:'), result, 300);
      expect(prisma.tenant.update).toHaveBeenCalled(); // lastUsedAt updated
    });

    it('should return null for invalid key', async () => {
      redis.get.mockResolvedValue(null);
      prisma.tenant.findMany.mockResolvedValue([{
        id: 'tenant-1',
        settings: { apiKeys: [] },
      }]);

      const result = await service.validateApiKey('cpk_invalid');
      expect(result).toBeNull();
    });

    it('should not match revoked keys', async () => {
      redis.get.mockResolvedValue(null);

      const { createHash } = require('crypto');
      const rawKey = 'cpk_revoked';
      const keyHash = createHash('sha256').update(rawKey).digest('hex');

      prisma.tenant.findMany.mockResolvedValue([{
        id: 'tenant-1',
        settings: {
          apiKeys: [{
            id: 'key-1', name: 'Revoked', keyHash, keyPrefix: 'cpk_revo',
            scopes: ['read'], createdAt: '2026-01-01T00:00:00Z',
            lastUsedAt: null, isActive: false,
          }],
        },
      }]);

      const result = await service.validateApiKey(rawKey);
      expect(result).toBeNull();
    });
  });

  // ─── Webhook Management ───

  describe('createWebhook', () => {
    it('should create a webhook and return secret only once', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());

      const result = await service.createWebhook('tenant-1', {
        url: 'https://example.com/webhook',
        events: ['video.uploaded', 'post.published'],
      });

      expect(result.secret).toMatch(/^whsec_/);
      expect(result.url).toBe('https://example.com/webhook');
      expect(result.events).toEqual(['video.uploaded', 'post.published']);
      expect(prisma.tenant.update).toHaveBeenCalled();
    });

    it('should include description when provided', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());

      const result = await service.createWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: ['video.uploaded'],
        description: 'My notification hook',
      });

      expect(result.description).toBe('My notification hook');
    });

    it('should throw on invalid event names', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());

      await expect(
        service.createWebhook('tenant-1', {
          url: 'https://example.com/hook',
          events: ['invalid.event'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when 5 active webhooks already exist', async () => {
      const webhooks = Array.from({ length: 5 }, (_, i) => ({
        id: `wh-${i}`, url: `https://example.com/${i}`, events: ['video.uploaded'],
        description: null, secret: 'whsec_test', createdAt: new Date().toISOString(), isActive: true,
      }));
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { webhooks } }));

      await expect(
        service.createWebhook('tenant-1', {
          url: 'https://example.com/overflow',
          events: ['video.uploaded'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listWebhooks', () => {
    it('should return webhooks without secret', async () => {
      const webhooks = [{
        id: 'wh-1', url: 'https://example.com/hook', events: ['video.uploaded'],
        description: 'Test', secret: 'whsec_hidden', createdAt: '2026-01-01T00:00:00Z', isActive: true,
      }];
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { webhooks } }));

      const result = await service.listWebhooks('tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('secret');
      expect(result[0].url).toBe('https://example.com/hook');
    });

    it('should return empty array when no webhooks', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());

      const result = await service.listWebhooks('tenant-1');
      expect(result).toEqual([]);
    });
  });

  describe('deleteWebhook', () => {
    it('should mark webhook as inactive', async () => {
      const webhooks = [{
        id: 'wh-1', url: 'https://example.com/hook', events: ['video.uploaded'],
        description: null, secret: 'whsec_test', createdAt: '2026-01-01T00:00:00Z', isActive: true,
      }];
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { webhooks } }));

      await service.deleteWebhook('tenant-1', 'wh-1');

      const updateCall = prisma.tenant.update.mock.calls[0][0];
      const updatedSettings = updateCall.data.settings as { webhooks: Array<{ isActive: boolean }> };
      expect(updatedSettings.webhooks[0].isActive).toBe(false);
    });

    it('should throw NotFoundException for unknown webhook', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ settings: { webhooks: [] } }));

      await expect(service.deleteWebhook('tenant-1', 'wh-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableEvents', () => {
    it('should return all available webhook events', async () => {
      const events = await service.getAvailableEvents();

      expect(events).toContain('video.uploaded');
      expect(events).toContain('video.processed');
      expect(events).toContain('post.published');
      expect(events).toContain('post.failed');
      expect(events).toContain('membership.created');
      expect(events).toContain('membership.cancelled');
      expect(events).toContain('deal.status_changed');
      expect(events).toContain('affiliate.conversion');
      expect(events).toHaveLength(8);
    });
  });

  // ─── Rate Limits ───

  describe('getRateLimits', () => {
    it('should return FREE plan limits by default', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ plan: 'FREE', settings: {} });

      const result = await service.getRateLimits('tenant-1');

      expect(result.plan).toBe('FREE');
      expect(result.limits.requestsPerMinute).toBe(10);
      expect(result.limits.requestsPerDay).toBe(100);
      expect(result.isCustom).toBe(false);
    });

    it('should return PRO plan limits', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ plan: 'PRO', settings: {} });

      const result = await service.getRateLimits('tenant-1');

      expect(result.limits.requestsPerMinute).toBe(60);
      expect(result.limits.requestsPerDay).toBe(5000);
    });

    it('should return ENTERPRISE plan limits', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ plan: 'ENTERPRISE', settings: {} });

      const result = await service.getRateLimits('tenant-1');
      expect(result.limits.requestsPerMinute).toBe(300);
    });

    it('should return custom limits when set', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        plan: 'PRO',
        settings: { rateLimits: { requestsPerMinute: 100, requestsPerDay: 10000 } },
      });

      const result = await service.getRateLimits('tenant-1');

      expect(result.isCustom).toBe(true);
      expect(result.limits.requestsPerMinute).toBe(100);
    });

    it('should throw NotFoundException for unknown tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getRateLimits('tenant-x')).rejects.toThrow(NotFoundException);
    });
  });
});
