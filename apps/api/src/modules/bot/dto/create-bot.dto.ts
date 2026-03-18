import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, IsUUID, IsBoolean, IsEnum, IsObject, MaxLength } from 'class-validator';
import { BotAccessTier } from '@prisma/client';

export class CreateBotDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  welcomeMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  systemPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({ description: 'Personality traits (JSON)' })
  @IsOptional()
  @IsObject()
  personality?: Record<string, unknown>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ enum: BotAccessTier, default: 'FREE' })
  @IsOptional()
  @IsEnum(BotAccessTier)
  accessTier?: BotAccessTier;
}
