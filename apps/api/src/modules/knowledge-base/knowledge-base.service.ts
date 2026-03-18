import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { KnowledgeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { IngestContentDto } from './dto/ingest-content.dto';
import { ListKnowledgeBasesQueryDto } from './dto/list-knowledge-bases-query.dto';

const CHUNK_SIZE = 500; // approximate tokens per chunk
const CHUNK_OVERLAP = 100;

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Knowledge Base CRUD ───

  async create(userId: string, tenantId: string, dto: CreateKnowledgeBaseDto) {
    const kb = await this.prisma.knowledgeBase.create({
      data: {
        userId,
        tenantId,
        name: dto.name,
        description: dto.description,
        sourceType: dto.sourceType,
        status: KnowledgeStatus.PROCESSING,
      },
    });

    return this.formatKb(kb);
  }

  async findAll(userId: string, tenantId: string, query: ListKnowledgeBasesQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.KnowledgeBaseWhereInput = {
      tenantId,
      userId,
      ...(query.status && { status: query.status }),
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' as const },
      }),
    };

    const items = await this.prisma.knowledgeBase.findMany({
      where,
      take: limit + 1,
      ...(query.cursor && { skip: 1, cursor: { id: query.cursor } }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map(this.formatKb),
      nextCursor,
      hasMore,
    };
  }

  async findById(userId: string, tenantId: string, id: string) {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: { _count: { select: { chunks: true } } },
    });

    if (!kb) throw new NotFoundException('Knowledge base not found');
    if (kb.userId !== userId || kb.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    return {
      ...this.formatKb(kb),
      chunkCount: kb._count.chunks,
    };
  }

  async remove(userId: string, tenantId: string, id: string) {
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb) throw new NotFoundException('Knowledge base not found');
    if (kb.userId !== userId || kb.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    // Delete chunks first, then knowledge base
    await this.prisma.knowledgeChunk.deleteMany({
      where: { knowledgeBaseId: id },
    });
    await this.prisma.knowledgeBase.delete({ where: { id } });
  }

  // ─── Ingest Content ───

  async ingest(userId: string, tenantId: string, kbId: string, dto: IngestContentDto) {
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: kbId } });
    if (!kb) throw new NotFoundException('Knowledge base not found');
    if (kb.userId !== userId || kb.tenantId !== tenantId) {
      throw new ForbiddenException();
    }

    // Simple text chunking
    const chunks = this.chunkText(dto.content, CHUNK_SIZE, CHUNK_OVERLAP);

    // Get current max chunk index
    const maxChunk = await this.prisma.knowledgeChunk.aggregate({
      where: { knowledgeBaseId: kbId },
      _max: { chunkIndex: true },
    });
    const startIndex = (maxChunk._max.chunkIndex ?? -1) + 1;

    // Create chunks
    const chunkRecords = chunks.map((content, i) => ({
      knowledgeBaseId: kbId,
      content,
      sourceRef: dto.sourceRef,
      chunkIndex: startIndex + i,
      tokenCount: this.estimateTokens(content),
    }));

    await this.prisma.knowledgeChunk.createMany({
      data: chunkRecords,
    });

    // Update knowledge base stats
    const totalChunks = await this.prisma.knowledgeChunk.count({
      where: { knowledgeBaseId: kbId },
    });

    await this.prisma.knowledgeBase.update({
      where: { id: kbId },
      data: {
        chunkCount: totalChunks,
        documentCount: { increment: 1 },
        status: KnowledgeStatus.READY,
      },
    });

    // TODO: Generate embeddings via OpenAI Embedding API
    // for (const chunk of chunkRecords) {
    //   const embedding = await openai.embeddings.create({ model: 'text-embedding-3-small', input: chunk.content });
    //   await prisma.$executeRaw`UPDATE knowledge_chunks SET embedding = ${embedding}::vector WHERE id = ${chunk.id}`;
    // }

    this.logger.log(`Ingested ${chunks.length} chunks into KB ${kbId}`);

    return {
      knowledgeBaseId: kbId,
      chunksCreated: chunks.length,
      totalChunks,
    };
  }

  // ─── Search (for RAG) ───

  async searchSimilar(kbId: string, query: string, topK: number = 5) {
    // TODO: When embeddings are available, use pgvector similarity search:
    // const results = await prisma.$queryRaw`
    //   SELECT id, content, source_ref, 1 - (embedding <=> ${queryEmbedding}::vector) as similarity
    //   FROM knowledge_chunks
    //   WHERE knowledge_base_id = ${kbId}
    //   ORDER BY embedding <=> ${queryEmbedding}::vector
    //   LIMIT ${topK}
    // `;

    // Fallback: simple text search
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: {
        knowledgeBaseId: kbId,
        content: { contains: query, mode: 'insensitive' },
      },
      take: topK,
      orderBy: { chunkIndex: 'asc' },
      select: {
        id: true,
        content: true,
        sourceRef: true,
        chunkIndex: true,
      },
    });

    return chunks;
  }

  // ─── Helpers ───

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let i = 0;

    while (i < words.length) {
      const end = Math.min(i + chunkSize, words.length);
      chunks.push(words.slice(i, end).join(' '));
      i += chunkSize - overlap;
      if (i >= words.length) break;
    }

    return chunks.length > 0 ? chunks : [text];
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 chars for English, ~2 chars for CJK
    return Math.ceil(text.length / 3);
  }

  private formatKb(kb: {
    id: string;
    name: string;
    description: string | null;
    sourceType: string;
    status: string;
    documentCount: number;
    chunkCount: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: kb.id,
      name: kb.name,
      description: kb.description,
      sourceType: kb.sourceType,
      status: kb.status,
      documentCount: kb.documentCount,
      chunkCount: kb.chunkCount,
      createdAt: kb.createdAt.toISOString(),
      updatedAt: kb.updatedAt.toISOString(),
    };
  }
}
