import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { KnowledgeStatus } from '@prisma/client';

export class ListKnowledgeBasesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ enum: KnowledgeStatus })
  @IsOptional()
  @IsEnum(KnowledgeStatus)
  status?: KnowledgeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
