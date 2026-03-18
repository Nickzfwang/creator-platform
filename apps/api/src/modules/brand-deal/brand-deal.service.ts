import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DealStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateBrandDealDto } from './dto/create-brand-deal.dto';
import { UpdateBrandDealDto } from './dto/update-brand-deal.dto';
import { ListBrandDealsQueryDto } from './dto/list-brand-deals-query.dto';
import { GenerateProposalDto } from './dto/generate-proposal.dto';

@Injectable()
export class BrandDealService {
  private readonly logger = new Logger(BrandDealService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  // ─── CRUD ───

  async create(userId: string, tenantId: string, dto: CreateBrandDealDto) {
    const deal = await this.prisma.brandDeal.create({
      data: {
        userId,
        tenantId,
        brandName: dto.brandName,
        dealType: dto.dealType,
        brandContact: dto.brandContact as unknown as Prisma.InputJsonValue,
        budgetRange: dto.budgetRange as unknown as Prisma.InputJsonValue,
        deliverables: dto.deliverables as unknown as Prisma.InputJsonValue,
        timelineStart: dto.timelineStart ? new Date(dto.timelineStart) : null,
        timelineEnd: dto.timelineEnd ? new Date(dto.timelineEnd) : null,
        notes: dto.notes,
        status: DealStatus.DRAFT,
      },
    });

    this.logger.log(`Brand deal ${deal.id} created for brand "${dto.brandName}"`);
    return this.formatDeal(deal);
  }

  async findAll(userId: string, tenantId: string, query: ListBrandDealsQueryDto) {
    const limit = query.limit ?? 20;

    const where: Prisma.BrandDealWhereInput = {
      userId,
      tenantId,
      ...(query.status && { status: query.status }),
      ...(query.dealType && { dealType: query.dealType }),
      ...(query.search && {
        brandName: { contains: query.search, mode: Prisma.QueryMode.insensitive },
      }),
    };

    const deals = await this.prisma.brandDeal.findMany({
      where,
      take: limit + 1,
      ...(query.cursor && { skip: 1, cursor: { id: query.cursor } }),
      orderBy: { updatedAt: 'desc' },
    });

    const hasMore = deals.length > limit;
    const data = hasMore ? deals.slice(0, limit) : deals;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map((d) => this.formatDeal(d)),
      nextCursor,
      hasMore,
    };
  }

  async findById(userId: string, tenantId: string, id: string) {
    const deal = await this.prisma.brandDeal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Brand deal not found');
    if (deal.userId !== userId || deal.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    return this.formatDeal(deal);
  }

  async update(userId: string, tenantId: string, id: string, dto: UpdateBrandDealDto) {
    const deal = await this.prisma.brandDeal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Brand deal not found');
    if (deal.userId !== userId || deal.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    // Validate status transitions
    if (dto.status && !this.isValidTransition(deal.status, dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${deal.status} to ${dto.status}`,
      );
    }

    const updated = await this.prisma.brandDeal.update({
      where: { id },
      data: {
        ...(dto.brandName !== undefined && { brandName: dto.brandName }),
        ...(dto.dealType !== undefined && { dealType: dto.dealType }),
        ...(dto.brandContact !== undefined && {
          brandContact: dto.brandContact as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.budgetRange !== undefined && {
          budgetRange: dto.budgetRange as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.deliverables !== undefined && {
          deliverables: dto.deliverables as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.timelineStart !== undefined && {
          timelineStart: new Date(dto.timelineStart),
        }),
        ...(dto.timelineEnd !== undefined && {
          timelineEnd: new Date(dto.timelineEnd),
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.actualRevenue !== undefined && { actualRevenue: dto.actualRevenue }),
        ...(dto.aiProposal !== undefined && { aiProposal: dto.aiProposal }),
      },
    });

    this.logger.log(`Brand deal ${id} updated`);
    return this.formatDeal(updated);
  }

  async remove(userId: string, tenantId: string, id: string) {
    const deal = await this.prisma.brandDeal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Brand deal not found');
    if (deal.userId !== userId || deal.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    if (deal.status === DealStatus.IN_PROGRESS || deal.status === DealStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot delete deal in ${deal.status} status. Cancel it first.`,
      );
    }

    await this.prisma.brandDeal.delete({ where: { id } });
    this.logger.log(`Brand deal ${id} deleted`);
  }

  // ─── AI Proposal Generation ───

  async generateProposal(userId: string, tenantId: string, dto: GenerateProposalDto) {
    const deal = await this.prisma.brandDeal.findUnique({ where: { id: dto.dealId } });
    if (!deal) throw new NotFoundException('Brand deal not found');
    if (deal.userId !== userId || deal.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    // Gather creator stats for proposal context
    const [socialAccounts, videoCount, memberCount] = await Promise.all([
      this.prisma.socialAccount.findMany({
        where: { userId, isActive: true },
        select: { platform: true, platformUsername: true, followerCount: true },
      }),
      this.prisma.video.count({ where: { userId } }),
      this.prisma.membership.count({
        where: { creatorUserId: userId, status: 'ACTIVE' },
      }),
    ]);

    const totalFollowers = socialAccounts.reduce(
      (sum, a) => sum + (a.followerCount ?? 0),
      0,
    );
    const platforms = socialAccounts
      .map((a) => `${a.platform}: @${a.platformUsername} (${a.followerCount ?? 0} followers)`)
      .join('\n');

    const tone = dto.tone ?? 'professional';
    const deliverablesList = (deal.deliverables as unknown as string[]) ?? [];
    const budgetRange = deal.budgetRange as unknown as { min?: number; max?: number; currency?: string } | null;

    const dealTypeLabel: Record<string, string> = {
      SPONSORED_POST: '贊助內容',
      AFFILIATE: '聯盟推廣',
      AMBASSADOR: '品牌大使',
      PRODUCT_REVIEW: '產品評測',
      EVENT: '活動合作',
    };

    const contextInfo = [
      `品牌名稱：${deal.brandName}`,
      `合作類型：${dealTypeLabel[deal.dealType] ?? deal.dealType}`,
      `全平台粉絲：${totalFollowers.toLocaleString()}`,
      `影片作品數：${videoCount}`,
      `付費會員數：${memberCount}`,
      platforms ? `活躍平台：\n${platforms}` : '',
      budgetRange ? `預算範圍：${budgetRange.currency ?? 'TWD'} ${budgetRange.min?.toLocaleString() ?? '?'} - ${budgetRange.max?.toLocaleString() ?? '?'}` : '',
      deliverablesList.length > 0 ? `交付項目：${deliverablesList.join(', ')}` : '',
      deal.notes ? `備註：${deal.notes}` : '',
      dto.additionalInstructions ? `附加說明：${dto.additionalInstructions}` : '',
    ].filter(Boolean).join('\n');

    const proposal = await this.aiService.chat(
      `你是一位專業的創作者經紀人和品牌合作策略師。請根據提供的資訊，生成一份完整的品牌合作提案。
使用繁體中文，Markdown 格式。
語調：${tone === 'professional' ? '專業正式' : tone === 'casual' ? '輕鬆親切' : tone}

提案需包含：
1. 標題（品牌 × 創作者）
2. 創作者數據（表格）
3. 合作方案說明
4. 交付項目（具體內容和數量）
5. 為什麼選擇此創作者（3-4 個優勢）
6. 預估成效（表格，含各平台觸及和互動）
7. 執行時程（4-5 週）

用 emoji 增加生動感，但保持專業。`,
      contextInfo,
      { model: 'gpt-4o-mini', maxTokens: 2048 },
    );

    // Save proposal to deal
    await this.prisma.brandDeal.update({
      where: { id: dto.dealId },
      data: { aiProposal: proposal },
    });

    this.logger.log(`AI proposal generated for deal ${dto.dealId}`);

    return {
      dealId: dto.dealId,
      proposal,
      tokensUsed: 0, // TODO: Track actual token usage
    };
  }

  // ─── Pipeline Stats ───

  async getPipelineStats(userId: string, tenantId: string) {
    const statusCounts = await this.prisma.brandDeal.groupBy({
      by: ['status'],
      where: { userId, tenantId },
      _count: true,
    });

    const totalRevenue = await this.prisma.brandDeal.aggregate({
      where: { userId, tenantId, status: DealStatus.COMPLETED },
      _sum: { actualRevenue: true },
    });

    const pipeline: Record<string, number> = {};
    for (const s of statusCounts) {
      pipeline[s.status] = s._count;
    }

    return {
      pipeline,
      totalDeals: statusCounts.reduce((sum, s) => sum + s._count, 0),
      totalRevenue: Number(totalRevenue._sum.actualRevenue ?? 0),
      activeDeals:
        (pipeline[DealStatus.PROPOSAL_SENT] ?? 0) +
        (pipeline[DealStatus.NEGOTIATING] ?? 0) +
        (pipeline[DealStatus.CONFIRMED] ?? 0) +
        (pipeline[DealStatus.IN_PROGRESS] ?? 0),
    };
  }

  // ─── Helpers ───

  private isValidTransition(current: DealStatus, next: DealStatus): boolean {
    const transitions: Record<DealStatus, DealStatus[]> = {
      [DealStatus.DRAFT]: [DealStatus.PROPOSAL_SENT, DealStatus.CANCELLED],
      [DealStatus.PROPOSAL_SENT]: [DealStatus.NEGOTIATING, DealStatus.CANCELLED, DealStatus.DRAFT],
      [DealStatus.NEGOTIATING]: [DealStatus.CONFIRMED, DealStatus.CANCELLED, DealStatus.DRAFT],
      [DealStatus.CONFIRMED]: [DealStatus.IN_PROGRESS, DealStatus.CANCELLED],
      [DealStatus.IN_PROGRESS]: [DealStatus.COMPLETED, DealStatus.CANCELLED],
      [DealStatus.COMPLETED]: [],
      [DealStatus.CANCELLED]: [DealStatus.DRAFT],
    };

    return transitions[current]?.includes(next) ?? false;
  }

  private formatDeal(deal: {
    id: string;
    brandName: string;
    dealType: string;
    status: string;
    brandContact: unknown;
    budgetRange: unknown;
    deliverables: unknown;
    aiProposal: string | null;
    proposalPdfUrl: string | null;
    timelineStart: Date | null;
    timelineEnd: Date | null;
    actualRevenue: unknown;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: deal.id,
      brandName: deal.brandName,
      dealType: deal.dealType,
      status: deal.status,
      brandContact: deal.brandContact,
      budgetRange: deal.budgetRange,
      deliverables: deal.deliverables,
      aiProposal: deal.aiProposal,
      proposalPdfUrl: deal.proposalPdfUrl,
      timelineStart: deal.timelineStart?.toISOString().split('T')[0] ?? null,
      timelineEnd: deal.timelineEnd?.toISOString().split('T')[0] ?? null,
      actualRevenue: deal.actualRevenue ? Number(deal.actualRevenue) : null,
      notes: deal.notes,
      createdAt: deal.createdAt.toISOString(),
      updatedAt: deal.updatedAt.toISOString(),
    };
  }
}
