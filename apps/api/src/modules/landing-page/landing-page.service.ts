import {
  Injectable, Logger, NotFoundException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

interface SocialLink { platform: string; url: string; }
interface CtaButton { label: string; url: string; style?: string; }
interface Section { type: string; title?: string; content?: string; items?: any[]; }

@Injectable()
export class LandingPageService {
  private readonly logger = new Logger(LandingPageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * AI-generate a landing page based on creator info
   */
  async aiGenerate(
    userId: string,
    tenantId: string,
    input: {
      creatorName: string;
      niche: string; // e.g. "科技", "美食", "旅遊"
      description?: string;
      socialLinks?: SocialLink[];
    },
  ) {
    const aiResult = await this.aiService.generateJson<{
      headline: string;
      subheadline: string;
      bio: string;
      ctaButtons: CtaButton[];
      sections: Section[];
      colorScheme: { primary: string; secondary: string; accent: string; background: string };
      theme: string;
    }>(
      `你是專業的 Landing Page 設計師。根據以下創作者資訊，生成一個完整的個人品牌頁面內容。

要求：
- headline: 吸引人的一句話標語（15字以內）
- subheadline: 副標題，說明價值主張（30字以內）
- bio: 個人簡介（80-120字，含個人特色和成就）
- ctaButtons: 2-3個行動按鈕，如 [{ "label": "訂閱頻道", "url": "#subscribe", "style": "primary" }]
- sections: 3-4個頁面區塊，每個含 type（hero/about/services/cta/testimonials/faq）, title, content
- colorScheme: 配色方案 { primary, secondary, accent, background } 用 hex 色碼
- theme: 推薦主題風格（modern/minimal/bold/creative）

回覆 JSON 格式。`,
      `創作者名稱：${input.creatorName}\n領域：${input.niche}\n${input.description ? `描述：${input.description}` : ''}\n社群連結：${JSON.stringify(input.socialLinks ?? [])}`,
      { maxTokens: 800 },
    );

    // Generate unique slug
    const baseSlug = this.generateSlug(input.creatorName);
    const slug = await this.ensureUniqueSlug(baseSlug);

    const page = await this.prisma.landingPage.create({
      data: {
        userId,
        tenantId,
        slug,
        title: `${input.creatorName} 的個人頁面`,
        headline: aiResult?.headline ?? `嗨，我是 ${input.creatorName}`,
        subheadline: aiResult?.subheadline ?? `${input.niche} 創作者`,
        bio: aiResult?.bio ?? '',
        theme: aiResult?.theme ?? 'modern',
        colorScheme: (aiResult?.colorScheme ?? {}) as any,
        socialLinks: (input.socialLinks ?? []) as any,
        ctaButtons: (aiResult?.ctaButtons ?? []) as any,
        sections: (aiResult?.sections ?? []) as any,
        isPublished: false,
      },
    });

    this.logger.log(`Landing page created: ${page.slug}`);
    return page;
  }

  /**
   * Get landing page by user
   */
  async getByUser(userId: string) {
    return this.prisma.landingPage.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get published page by slug (public)
   */
  async getBySlug(slug: string) {
    const page = await this.prisma.landingPage.findUnique({
      where: { slug },
    });

    if (!page) throw new NotFoundException('Page not found');
    if (!page.isPublished) throw new NotFoundException('Page not published');

    // Increment view count
    await this.prisma.landingPage.update({
      where: { id: page.id },
      data: { viewCount: { increment: 1 } },
    });

    return page;
  }

  /**
   * Update landing page
   */
  async update(
    pageId: string,
    userId: string,
    data: Partial<{
      title: string;
      headline: string;
      subheadline: string;
      bio: string;
      avatarUrl: string;
      coverUrl: string;
      theme: string;
      colorScheme: any;
      socialLinks: SocialLink[];
      ctaButtons: CtaButton[];
      sections: Section[];
      customCss: string;
      isPublished: boolean;
    }>,
  ) {
    const page = await this.prisma.landingPage.findUnique({ where: { id: pageId } });
    if (!page || page.userId !== userId) throw new NotFoundException('Page not found');

    return this.prisma.landingPage.update({
      where: { id: pageId },
      data: data as any,
    });
  }

  /**
   * AI regenerate specific section
   */
  async aiRegenerateSection(
    pageId: string,
    userId: string,
    sectionType: string,
    context?: string,
  ) {
    const page = await this.prisma.landingPage.findUnique({ where: { id: pageId } });
    if (!page || page.userId !== userId) throw new NotFoundException('Page not found');

    const result = await this.aiService.generateJson<{
      title: string;
      content: string;
      items?: any[];
    }>(
      `為創作者的 Landing Page 生成一個「${sectionType}」區塊。
要求：
- title: 區塊標題
- content: 區塊內容（50-100字）
- items: 如果是列表型區塊（services/faq），提供 3-5 個項目

回覆 JSON: { "title": "...", "content": "...", "items": [...] }`,
      `頁面標題：${page.title}\n標語：${page.headline}\n${context ? `額外說明：${context}` : ''}`,
      { maxTokens: 400 },
    );

    return result;
  }

  /**
   * Delete landing page
   */
  async delete(pageId: string, userId: string) {
    const page = await this.prisma.landingPage.findUnique({ where: { id: pageId } });
    if (!page || page.userId !== userId) throw new NotFoundException('Page not found');

    await this.prisma.landingPage.delete({ where: { id: pageId } });
    return { deleted: true };
  }

  // --- Utility ---

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'creator';
  }

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let counter = 0;
    while (true) {
      const existing = await this.prisma.landingPage.findUnique({ where: { slug } });
      if (!existing) return slug;
      counter++;
      slug = `${base}-${counter}`;
    }
  }
}
