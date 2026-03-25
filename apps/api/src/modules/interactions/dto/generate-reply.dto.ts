import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsIn } from 'class-validator';

export class GenerateReplyDto {
  @ApiPropertyOptional({ description: '知識庫 ID（用於 RAG 回覆）' })
  @IsOptional()
  @IsUUID()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({ description: '回覆語氣', enum: ['friendly', 'professional', 'casual'] })
  @IsOptional()
  @IsString()
  @IsIn(['friendly', 'professional', 'casual'])
  tone?: string;
}
