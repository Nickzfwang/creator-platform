import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { AdminUpdateTenantDto } from './dto/admin-update-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public / User-facing ───

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        customDomain: true,
        logoUrl: true,
        plan: true,
        themeConfig: true,
        settings: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('errors.tenant.notFound');
    }

    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        customDomain: true,
        logoUrl: true,
        plan: true,
        themeConfig: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('errors.tenant.notFound');
    }

    return tenant;
  }

  async findByDomain(domain: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { customDomain: domain },
      select: {
        id: true,
        name: true,
        slug: true,
        customDomain: true,
        logoUrl: true,
        plan: true,
        themeConfig: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('errors.tenant.notFound');
    }

    return tenant;
  }

  async updateSettings(
    tenantId: string,
    userRole: string,
    dto: UpdateTenantSettingsDto,
  ) {
    if (userRole !== 'CREATOR' && userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'Only CREATOR or ADMIN can update tenant settings',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('errors.tenant.notFound');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }
    if (dto.logoUrl !== undefined) {
      updateData.logoUrl = dto.logoUrl;
    }
    if (dto.themeConfig !== undefined) {
      updateData.themeConfig = this.sanitizeThemeConfig(dto.themeConfig);
    }
    if (dto.settings !== undefined) {
      updateData.settings = dto.settings;
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        themeConfig: true,
        settings: true,
        updatedAt: true,
      },
    });
  }

  // ─── Admin Management ───

  async listTenants(query: ListTenantsQueryDto) {
    const limit = query.limit ?? 20;

    const where: Prisma.TenantWhereInput = {
      ...(query.plan && { plan: query.plan }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { slug: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
        ],
      }),
    };

    const tenants = await this.prisma.tenant.findMany({
      where,
      take: limit + 1,
      ...(query.cursor && { skip: 1, cursor: { id: query.cursor } }),
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    const hasMore = tenants.length > limit;
    const data = hasMore ? tenants.slice(0, limit) : tenants;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        customDomain: t.customDomain,
        logoUrl: t.logoUrl,
        plan: t.plan,
        userCount: t._count.users,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    };
  }

  async adminUpdateTenant(tenantId: string, dto: AdminUpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('errors.tenant.notFound');
    }

    // Check custom domain uniqueness
    if (dto.customDomain && dto.customDomain !== tenant.customDomain) {
      const existing = await this.prisma.tenant.findFirst({
        where: { customDomain: dto.customDomain },
      });
      if (existing) {
        throw new ConflictException('errors.tenant.domainConflict');
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.customDomain !== undefined && { customDomain: dto.customDomain }),
        ...(dto.plan !== undefined && { plan: dto.plan }),
        ...(dto.themeConfig !== undefined && {
          themeConfig: dto.themeConfig as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.settings !== undefined && {
          settings: dto.settings as unknown as Prisma.InputJsonValue,
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        customDomain: true,
        logoUrl: true,
        plan: true,
        themeConfig: true,
        settings: true,
        updatedAt: true,
      },
    });

    this.logger.log(`Tenant ${tenantId} updated by admin`);
    return updated;
  }

  async getTenantStats(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('errors.tenant.notFound');
    }

    const [userCount, videoCount, postCount, dealCount, membershipCount] =
      await Promise.all([
        this.prisma.user.count({ where: { tenantId } }),
        this.prisma.video.count({ where: { tenantId } }),
        this.prisma.post.count({ where: { tenantId } }),
        this.prisma.brandDeal.count({ where: { tenantId } }),
        this.prisma.membership.count({ where: { tenantId, status: 'ACTIVE' } }),
      ]);

    return {
      tenantId,
      plan: tenant.plan,
      users: userCount,
      videos: videoCount,
      posts: postCount,
      brandDeals: dealCount,
      activeMemberships: membershipCount,
    };
  }

  // ─── Branding / Theme ───

  async getBranding(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        customDomain: true,
        themeConfig: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('errors.tenant.notFound');
    }

    return {
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      customDomain: tenant.customDomain,
      theme: tenant.themeConfig ?? {},
    };
  }

  // ─── Domain Verification ───

  async verifyDomain(tenantId: string, domain: string) {
    const expectedCname = 'cname.creatorplatform.app';
    let verified = false;

    try {
      const dns = await import('dns');
      const records = await new Promise<string[]>((resolve, reject) => {
        dns.resolveCname(domain, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses || []);
        });
      });

      verified = records.some(
        (r) => r.toLowerCase() === expectedCname.toLowerCase(),
      );

      this.logger.log(
        `DNS verification for ${domain}: ${verified ? 'PASS' : 'FAIL'} (records: ${records.join(', ')})`,
      );
    } catch (err) {
      this.logger.warn(`DNS verification failed for ${domain}: ${err}`);
    }

    // Update tenant's custom domain if verified
    if (verified) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { customDomain: domain },
      });
    }

    return {
      domain,
      verified,
      expectedCname,
      instructions: verified
        ? '域名驗證成功'
        : `請新增 CNAME 記錄，將 ${domain} 指向 ${expectedCname}`,
    };
  }

  // ─── Helpers ───

  private sanitizeThemeConfig(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const allowedKeys = [
      'primaryColor',
      'accentColor',
      'fontFamily',
      'borderRadius',
      'darkMode',
    ];
    const sanitized: Record<string, unknown> = {};

    for (const key of allowedKeys) {
      if (key in config) {
        const value = config[key];
        if (typeof value === 'string') {
          sanitized[key] = value.replace(/<[^>]*>/g, '');
        } else if (typeof value === 'boolean' || typeof value === 'number') {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }
}
