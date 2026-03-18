import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { KnowledgeSourceType } from '@prisma/client';

export class CreateKnowledgeBaseDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: KnowledgeSourceType })
  @IsEnum(KnowledgeSourceType)
  sourceType: KnowledgeSourceType;
}
