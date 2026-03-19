import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class DigitalProductService {
  private readonly logger = new Logger(DigitalProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async create(userId: string, tenantId: string, dto: {
    name: string;
    description?: string;
    productType: string;
    price: number;
    compareAtPrice?: number;
    tags?: string[];
    coverImageUrl?: string;
    fileUrl?: string;
  }) {
    // AI generate description + tags if not provided
    let aiDescription: string | null = null;
    let aiTags: string[] = [];

    if (this.aiService.isAvailable) {
      const result = await this.aiService.generateJson<{
        description: string;
        tags: string[];
        pricingSuggestion: string;
      }>(
        `你是數位商品行銷專家。根據以下商品資訊，生成：
- description: 吸引人的商品描述（100-200字繁體中文，含 emoji，強調價值和稀缺性）
- tags: 5-8 個搜尋標籤
- pricingSuggestion: 一句定價建議

回覆 JSON: { "description": "...", "tags": [...], "pricingSuggestion": "..." }`,
        `商品名稱：${dto.name}\n類型：${dto.productType}\n價格：NT$${dto.price}\n創作者描述：${dto.description || '無'}`,
        { maxTokens: 400 },
      );

      aiDescription = result?.description ?? null;
      aiTags = result?.tags ?? [];
    }

    const product = await this.prisma.digitalProduct.create({
      data: {
        userId,
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        aiDescription,
        productType: dto.productType as any,
        price: dto.price,
        compareAtPrice: dto.compareAtPrice ?? null,
        coverImageUrl: dto.coverImageUrl ?? null,
        fileUrl: dto.fileUrl ?? null,
        tags: dto.tags ?? [],
        aiTags,
      },
    });

    this.logger.log(`Product created: ${product.id} — ${product.name}`);
    return product;
  }

  async list(userId: string, options?: { published?: boolean }) {
    const where: any = { userId };
    if (options?.published !== undefined) where.isPublished = options.published;

    return this.prisma.digitalProduct.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orders: true } } },
    });
  }

  async getById(productId: string, userId: string) {
    const product = await this.prisma.digitalProduct.findUnique({
      where: { id: productId },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { orders: true } },
      },
    });
    if (!product || product.userId !== userId) throw new NotFoundException('Product not found');
    return product;
  }

  async update(productId: string, userId: string, dto: {
    name?: string;
    description?: string;
    price?: number;
    compareAtPrice?: number;
    isPublished?: boolean;
    coverImageUrl?: string;
    fileUrl?: string;
    tags?: string[];
  }) {
    const product = await this.prisma.digitalProduct.findUnique({ where: { id: productId } });
    if (!product || product.userId !== userId) throw new NotFoundException('Product not found');

    return this.prisma.digitalProduct.update({
      where: { id: productId },
      data: dto,
    });
  }

  async delete(productId: string, userId: string) {
    const product = await this.prisma.digitalProduct.findUnique({ where: { id: productId } });
    if (!product || product.userId !== userId) throw new NotFoundException('Product not found');

    await this.prisma.productOrder.deleteMany({ where: { productId } });
    await this.prisma.digitalProduct.delete({ where: { id: productId } });
    return { deleted: true };
  }

  // Public storefront
  async getPublicProducts(userId: string) {
    return this.prisma.digitalProduct.findMany({
      where: { userId, isPublished: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, description: true, aiDescription: true,
        productType: true, price: true, compareAtPrice: true, currency: true,
        coverImageUrl: true, previewImages: true, tags: true, aiTags: true,
        salesCount: true, createdAt: true,
      },
    });
  }

  // Purchase flow (simplified for MVP)
  async purchase(productId: string, buyerEmail: string, buyerName?: string) {
    const product = await this.prisma.digitalProduct.findUnique({ where: { id: productId } });
    if (!product || !product.isPublished) throw new NotFoundException('Product not found');

    const order = await this.prisma.productOrder.create({
      data: {
        productId,
        buyerEmail,
        buyerName: buyerName ?? null,
        amount: product.price,
        currency: product.currency,
        status: 'COMPLETED',
      },
    });

    // Update sales count
    await this.prisma.digitalProduct.update({
      where: { id: productId },
      data: {
        salesCount: { increment: 1 },
        totalRevenue: { increment: product.price },
      },
    });

    this.logger.log(`Order ${order.id} created for product ${productId}`);
    return { orderId: order.id, downloadUrl: product.fileUrl };
  }

  // AI regenerate description
  async aiRegenerate(productId: string, userId: string) {
    const product = await this.prisma.digitalProduct.findUnique({ where: { id: productId } });
    if (!product || product.userId !== userId) throw new NotFoundException('Product not found');

    const result = await this.aiService.generateJson<{
      description: string;
      tags: string[];
      salesPitch: string;
    }>(
      `你是數位商品行銷專家。請為以下商品重新生成更吸引人的描述：
- description: 200字以內的銷售文案（繁體中文，含 emoji，強調轉換率）
- tags: 5-8 個 SEO 標籤
- salesPitch: 一句30字以內的銷售標語

回覆 JSON: { "description": "...", "tags": [...], "salesPitch": "..." }`,
      `商品：${product.name}\n類型：${product.productType}\n價格：NT$${product.price}\n目前描述：${product.description || '無'}`,
      { maxTokens: 400 },
    );

    const updated = await this.prisma.digitalProduct.update({
      where: { id: productId },
      data: {
        aiDescription: result?.description ?? product.aiDescription,
        aiTags: result?.tags ?? product.aiTags,
      },
    });

    return { ...updated, salesPitch: result?.salesPitch ?? '' };
  }
}
