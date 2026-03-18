import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';

export class AiGeneratePostDto {
  @ApiPropertyOptional({ description: 'VideoClip ID for context' })
  @IsOptional()
  @IsUUID()
  clipId?: string;

  @ApiProperty({ example: ['YOUTUBE', 'INSTAGRAM'] })
  @IsArray()
  @IsString({ each: true })
  platforms: string[];

  @ApiProperty({ example: 'casual' })
  @IsIn(['professional', 'casual', 'humorous', 'educational', 'promotional'])
  tone: string;

  @ApiPropertyOptional({ example: 'Focus on the cooking technique' })
  @IsOptional()
  @IsString()
  additionalContext?: string;

  @ApiPropertyOptional({ example: 'zh-TW', default: 'zh-TW' })
  @IsOptional()
  @IsString()
  language?: string;
}
