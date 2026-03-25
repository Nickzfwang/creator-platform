import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CreateWebhookDto } from './dto/create-webhook.dto';

/**
 * API keys and webhooks are stored in the tenant's `settings` JSON field
 * under `settings.apiKeys` and `settings.webhooks`.
 *
 * Structure:
 * {
 *   apiKeys: [{ id, name, keyHash, keyPrefix, scopes, createdAt, lastUsedAt, isActive }],
 *   webhooks: [{ id, url, events, description, secret, createdAt, isActive }],
 *   rateLimits: { requestsPerMinute, requestsPerDay }
 * }
 */

interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
}

interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  secret: string;
  createdAt: string;
  isActive: boolean;
}

interface TenantSettings {
  apiKeys?: ApiKeyRecord[];
  webhooks?: WebhookRecord[];
  rateLimits?: { requestsPerMinute: number; requestsPerDay: number };
  [key: string]: unknown;
}

// Available webhook events
const AVAILABLE_EVENTS = [
  'video.uploaded',
  'video.processed',
  'post.published',
  'post.failed',
  'membership.created',
  'membership.cancelled',
  'deal.status_changed',
  'affiliate.conversion',
];

// Rate limits by plan
const RATE_LIMITS: Record<string, { requestsPerMinute: number; requestsPerDay: number }> = {
  FREE: { requestsPerMinute: 10, requestsPerDay: 100 },
  PRO: { requestsPerMinute: 60, requestsPerDay: 5000 },
  ENTERPRISE: { requestsPerMinute: 300, requestsPerDay: 50000 },
  WHITELABEL: { requestsPerMinute: 600, requestsPerDay: 100000 },
};

@Injectable()
export class ApiGatewayService {
  private readonly logger = new Logger(ApiGatewayService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── API Key Management ───

  async createApiKey(userId: string, tenantId: string, dto: CreateApiKeyDto) {
    const tenant = await this.getTenant(tenantId);
    const settings = (tenant.settings as unknown as TenantSettings) ?? {};
    const apiKeys = settings.apiKeys ?? [];

    // Limit number of API keys
    if (apiKeys.filter((k) => k.isActive).length >= 10) {
      throw new BadRequestException('Maximum 10 active API keys allowed');
    }

    // Generate API key: prefix_randomBytes
    const rawKey = `cpk_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 8);

    const newKey: ApiKeyRecord = {
      id: randomBytes(8).toString('hex'),
      name: dto.name,
      keyHash,
      keyPrefix,
      scopes: dto.scopes ?? ['read', 'write'],
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      isActive: true,
    };

    apiKeys.push(newKey);
    settings.apiKeys = apiKeys;

    await this.updateTenantSettings(tenantId, settings);

    this.logger.log(`API key "${dto.name}" created for tenant ${tenantId}`);

    // Return the raw key ONLY on creation — never stored/returned again
    return {
      id: newKey.id,
      name: newKey.name,
      key: rawKey, // ⚠️ Only returned once!
      keyPrefix: newKey.keyPrefix,
      scopes: newKey.scopes,
      createdAt: newKey.createdAt,
    };
  }

  async listApiKeys(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    const settings = (tenant.settings as unknown as TenantSettings) ?? {};
    const apiKeys = settings.apiKeys ?? [];

    return apiKeys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      isActive: k.isActive,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));
  }

  async revokeApiKey(tenantId: string, keyId: string) {
    const tenant = await this.getTenant(tenantId);
    const settings = (tenant.settings as unknown as TenantSettings) ?? {};
    const apiKeys = settings.apiKeys ?? [];

    const keyIndex = apiKeys.findIndex((k) => k.id === keyId);
    if (keyIndex === -1) {
      throw new NotFoundException('API key not found');
    }

    apiKeys[keyIndex].isActive = false;
    settings.apiKeys = apiKeys;

    await this.updateTenantSettings(tenantId, settings);
    this.logger.log(`API key ${keyId} revoked for tenant ${tenantId}`);
  }

  async validateApiKey(rawKey: string): Promise<{ tenantId: string; scopes: string[] } | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    // Note: For production scale, cache validated keys in Redis
    // Current approach scans tenants — acceptable for < 1000 tenants
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, settings: true },
    });

    for (const tenant of tenants) {
      const settings = (tenant.settings as unknown as TenantSettings) ?? {};
      const apiKeys = settings.apiKeys ?? [];
      const matched = apiKeys.find((k) => k.keyHash === keyHash && k.isActive);
      if (matched) {
        // Update lastUsedAt
        matched.lastUsedAt = new Date().toISOString();
        settings.apiKeys = apiKeys;
        await this.updateTenantSettings(tenant.id, settings);
        return { tenantId: tenant.id, scopes: matched.scopes };
      }
    }

    return null;
  }

  // ─── Webhook Management ───

  async createWebhook(tenantId: string, dto: CreateWebhookDto) {
    // Validate event names
    const invalidEvents = dto.events.filter((e) => !AVAILABLE_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      throw new BadRequestException(
        `Invalid events: ${invalidEvents.join(', ')}. Available: ${AVAILABLE_EVENTS.join(', ')}`,
      );
    }

    const tenant = await this.getTenant(tenantId);
    const settings = (tenant.settings as unknown as TenantSettings) ?? {};
    const webhooks = settings.webhooks ?? [];

    if (webhooks.filter((w) => w.isActive).length >= 5) {
      throw new BadRequestException('Maximum 5 active webhooks allowed');
    }

    const secret = `whsec_${randomBytes(24).toString('hex')}`;

    const webhook: WebhookRecord = {
      id: randomBytes(8).toString('hex'),
      url: dto.url,
      events: dto.events,
      description: dto.description ?? null,
      secret,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    webhooks.push(webhook);
    settings.webhooks = webhooks;

    await this.updateTenantSettings(tenantId, settings);

    this.logger.log(`Webhook created for tenant ${tenantId}: ${dto.url}`);

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      description: webhook.description,
      secret, // ⚠️ Only returned once!
      createdAt: webhook.createdAt,
    };
  }

  async listWebhooks(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    const settings = (tenant.settings as unknown as TenantSettings) ?? {};
    const webhooks = settings.webhooks ?? [];

    return webhooks.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      description: w.description,
      isActive: w.isActive,
      createdAt: w.createdAt,
    }));
  }

  async deleteWebhook(tenantId: string, webhookId: string) {
    const tenant = await this.getTenant(tenantId);
    const settings = (tenant.settings as unknown as TenantSettings) ?? {};
    const webhooks = settings.webhooks ?? [];

    const index = webhooks.findIndex((w) => w.id === webhookId);
    if (index === -1) {
      throw new NotFoundException('Webhook not found');
    }

    webhooks[index].isActive = false;
    settings.webhooks = webhooks;

    await this.updateTenantSettings(tenantId, settings);
    this.logger.log(`Webhook ${webhookId} disabled for tenant ${tenantId}`);
  }

  async getAvailableEvents() {
    return AVAILABLE_EVENTS;
  }

  // ─── Rate Limits ───

  async getRateLimits(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, settings: true },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    const settings = (tenant.settings as unknown as TenantSettings) ?? {};
    const customLimits = settings.rateLimits;
    const planLimits = RATE_LIMITS[tenant.plan] ?? RATE_LIMITS.FREE;

    return {
      plan: tenant.plan,
      limits: customLimits ?? planLimits,
      isCustom: !!customLimits,
    };
  }

  // ─── Helpers ───

  private async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, settings: true },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  private async updateTenantSettings(tenantId: string, settings: TenantSettings) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: settings as unknown as Prisma.InputJsonValue },
    });
  }
}
