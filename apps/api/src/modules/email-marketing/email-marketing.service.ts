import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { EmailSendJobData } from './email-send.processor';

@Injectable()
export class EmailMarketingService {
  private readonly logger = new Logger(EmailMarketingService.name);
  private readonly unsubscribeSecret: string;
  private readonly apiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly config: ConfigService,
    @InjectQueue('email-send') private readonly emailQueue: Queue,
  ) {
    this.unsubscribeSecret = this.config.get<string>(
      'UNSUBSCRIBE_SECRET',
      this.config.get<string>('JWT_SECRET', 'default-unsub-secret'),
    );
    this.apiUrl = this.config.get<string>('API_URL', 'http://localhost:4000');
  }

  // ─── Unsubscribe Token ───

  generateUnsubscribeToken(subscriberId: string): string {
    const hmac = createHmac('sha256', this.unsubscribeSecret);
    hmac.update(subscriberId);
    return hmac.digest('hex').slice(0, 32);
  }

  verifyUnsubscribeToken(subscriberId: string, token: string): boolean {
    return this.generateUnsubscribeToken(subscriberId) === token;
  }

  getUnsubscribeUrl(subscriberId: string): string {
    const token = this.generateUnsubscribeToken(subscriberId);
    return `${this.apiUrl}/v1/email/unsubscribe?id=${subscriberId}&token=${token}`;
  }

  async processUnsubscribe(subscriberId: string, token: string) {
    if (!this.verifyUnsubscribeToken(subscriberId, token)) {
      throw new BadRequestException('Invalid unsubscribe link');
    }

    const sub = await this.prisma.emailSubscriber.findUnique({ where: { id: subscriberId } });
    if (!sub) throw new NotFoundException('Subscriber not found');

    if (!sub.isActive) return { alreadyUnsubscribed: true };

    await this.prisma.emailSubscriber.update({
      where: { id: subscriberId },
      data: { isActive: false },
    });

    this.logger.log(`Subscriber ${sub.email} unsubscribed via link`);
    return { unsubscribed: true, email: sub.email };
  }

  // ─── Subscribers ───

  async addSubscriber(userId: string, tenantId: string, dto: {
    email: string; name?: string; source?: string; tags?: string[];
  }) {
    return this.prisma.emailSubscriber.upsert({
      where: { userId_email: { userId, email: dto.email } },
      create: {
        userId, tenantId,
        email: dto.email,
        name: dto.name ?? null,
        source: dto.source ?? 'manual',
        tags: dto.tags ?? [],
      },
      update: {
        name: dto.name ?? undefined,
        isActive: true,
        tags: dto.tags ?? undefined,
      },
    });
  }

  async listSubscribers(userId: string, options?: { active?: boolean; tag?: string }) {
    const where: any = { userId };
    if (options?.active !== undefined) where.isActive = options.active;
    if (options?.tag) where.tags = { has: options.tag };

    const [subscribers, total] = await Promise.all([
      this.prisma.emailSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.emailSubscriber.count({ where }),
    ]);

    const activeCount = await this.prisma.emailSubscriber.count({ where: { userId, isActive: true } });
    return { subscribers, total, activeCount };
  }

  async removeSubscriber(subscriberId: string, userId: string) {
    const sub = await this.prisma.emailSubscriber.findUnique({ where: { id: subscriberId } });
    if (!sub || sub.userId !== userId) throw new NotFoundException();
    return this.prisma.emailSubscriber.update({
      where: { id: subscriberId },
      data: { isActive: false },
    });
  }

  // ─── Campaigns ───

  async createCampaign(userId: string, tenantId: string, dto: {
    name: string; type?: string; targetTags?: string[];
  }) {
    return this.prisma.emailCampaign.create({
      data: {
        userId, tenantId,
        name: dto.name,
        type: dto.type ?? 'SINGLE',
        targetTags: dto.targetTags ?? [],
      },
      include: { emails: true },
    });
  }

  async listCampaigns(userId: string) {
    return this.prisma.emailCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { emails: true } } },
    });
  }

  async getCampaign(campaignId: string, userId: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: { emails: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!campaign || campaign.userId !== userId) throw new NotFoundException();
    return campaign;
  }

  async deleteCampaign(campaignId: string, userId: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.userId !== userId) throw new NotFoundException();
    await this.prisma.emailCampaign.delete({ where: { id: campaignId } });
    return { deleted: true };
  }

  // ─── AI Generate Email Sequence ───

  async aiGenerateSequence(userId: string, tenantId: string, dto: {
    purpose: string; // e.g., "新課程推廣", "會員歡迎", "限時優惠"
    productName?: string;
    tone?: string; // 專業, 親切, 熱情
    emailCount?: number;
  }) {
    const count = dto.emailCount ?? 3;

    // Create campaign
    const campaign = await this.prisma.emailCampaign.create({
      data: {
        userId, tenantId,
        name: `${dto.purpose} — AI 序列`,
        type: 'SEQUENCE',
      },
    });

    // Generate email sequence with AI
    const result = await this.aiService.generateJson<{
      emails: Array<{
        subject: string;
        body: string;
        delayDays: number;
        purpose: string;
      }>;
    }>(
      `你是 Email 行銷專家。請為創作者生成一套 ${count} 封的自動化郵件序列。

要求：
- 每封信都要有 subject（主旨，30字以內，含 emoji）和 body（HTML 格式信件內容，200-400字）
- delayDays：第幾天發送（第1封=0，後續遞增）
- purpose：這封信的目的（一句話）
- 語氣：${dto.tone || '親切專業'}
- 使用繁體中文
- body 中用 {{name}} 代表收件者名字
- 信件要有明確的 CTA（行動呼籲）

郵件序列結構：
1. 歡迎信（立即發送）— 建立信任
2. 價值信（2-3天後）— 提供免費價值
3. 銷售信（5-7天後）— 推廣商品/服務
${count > 3 ? `4-${count}. 更多信件（持續培養 + 稀缺感）` : ''}

回覆 JSON: { "emails": [{ "subject": "...", "body": "...", "delayDays": 0, "purpose": "..." }, ...] }`,
      `目的：${dto.purpose}\n${dto.productName ? `商品：${dto.productName}` : ''}`,
      { maxTokens: 2000 },
    );

    if (!result?.emails?.length) {
      throw new Error('AI 生成失敗');
    }

    // Save templates
    const emails = await Promise.all(
      result.emails.map((email, i) =>
        this.prisma.emailTemplate.create({
          data: {
            campaignId: campaign.id,
            subject: email.subject,
            body: email.body,
            sortOrder: i,
            delayDays: email.delayDays,
          },
        }),
      ),
    );

    this.logger.log(`AI sequence generated: ${campaign.id} — ${emails.length} emails`);
    return { ...campaign, emails };
  }

  // ─── AI Generate Single Email ───

  async aiGenerateSingleEmail(userId: string, dto: {
    purpose: string;
    context?: string;
    tone?: string;
  }) {
    const result = await this.aiService.generateJson<{
      subject: string;
      body: string;
      previewText: string;
    }>(
      `你是 Email 行銷專家。請生成一封行銷郵件：
- subject: 主旨（30字以內，含 emoji，高開信率）
- body: HTML 格式信件內容（300字以內，繁體中文，含 CTA 按鈕的 HTML）
- previewText: 預覽文字（50字以內）

語氣：${dto.tone || '親切專業'}
用 {{name}} 代表收件者名字

回覆 JSON: { "subject": "...", "body": "...", "previewText": "..." }`,
      `目的：${dto.purpose}\n${dto.context ? `背景：${dto.context}` : ''}`,
      { maxTokens: 800 },
    );

    return result;
  }

  // ─── Send Campaign ───

  async sendCampaign(campaignId: string, userId: string, tenantId: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: { emails: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!campaign || campaign.userId !== userId) throw new NotFoundException();
    if (campaign.status === 'SENT') throw new BadRequestException('此活動已寄送');
    if (!campaign.emails.length) throw new BadRequestException('此活動沒有郵件模板');

    // Get target subscribers (filter by tags if specified)
    const where: any = { userId, isActive: true };
    if (campaign.targetTags.length > 0) {
      where.tags = { hasSome: campaign.targetTags };
    }

    const subscribers = await this.prisma.emailSubscriber.findMany({
      where,
      select: { id: true, email: true, name: true },
    });

    if (subscribers.length === 0) throw new BadRequestException('沒有符合條件的訂閱者');

    // Update status to SENDING
    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING' },
    });

    // For SINGLE campaigns: send the first email immediately
    // For SEQUENCE campaigns: send the first email now, schedule the rest
    const firstEmail = campaign.emails[0];

    const jobData: EmailSendJobData = {
      campaignId,
      userId,
      subject: firstEmail.subject,
      htmlContent: firstEmail.body,
      subscribers: subscribers.map(s => ({ id: s.id, email: s.email, name: s.name })),
    };

    await this.emailQueue.add('send-campaign', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    // Schedule subsequent emails for SEQUENCE campaigns
    if (campaign.type === 'SEQUENCE' && campaign.emails.length > 1) {
      for (let i = 1; i < campaign.emails.length; i++) {
        const email = campaign.emails[i];
        const delayMs = email.delayDays * 24 * 60 * 60 * 1000;

        await this.emailQueue.add('send-campaign', {
          campaignId,
          userId,
          subject: email.subject,
          htmlContent: email.body,
          subscribers: subscribers.map(s => ({ id: s.id, email: s.email, name: s.name })),
        } satisfies EmailSendJobData, {
          delay: delayMs,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        });
      }
    }

    this.logger.log(`Campaign ${campaignId} queued: ${subscribers.length} subscribers, ${campaign.emails.length} emails`);

    return {
      queued: true,
      subscriberCount: subscribers.length,
      emailCount: campaign.emails.length,
    };
  }

  // ─── Stats ───

  async getStats(userId: string) {
    const [totalSubscribers, activeSubscribers, totalCampaigns, sentCampaigns] = await Promise.all([
      this.prisma.emailSubscriber.count({ where: { userId } }),
      this.prisma.emailSubscriber.count({ where: { userId, isActive: true } }),
      this.prisma.emailCampaign.count({ where: { userId } }),
      this.prisma.emailCampaign.count({ where: { userId, status: 'SENT' } }),
    ]);

    const campaigns = await this.prisma.emailCampaign.findMany({
      where: { userId, status: 'SENT' },
      select: { sentCount: true, openCount: true, clickCount: true },
    });

    const totalSent = campaigns.reduce((s, c) => s + c.sentCount, 0);
    const totalOpens = campaigns.reduce((s, c) => s + c.openCount, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clickCount, 0);

    return {
      totalSubscribers,
      activeSubscribers,
      totalCampaigns,
      sentCampaigns,
      totalSent,
      averageOpenRate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
      averageClickRate: totalSent > 0 ? Math.round((totalClicks / totalSent) * 100) : 0,
    };
  }
}
