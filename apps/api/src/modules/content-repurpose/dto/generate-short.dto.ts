import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class GenerateShortFromItemDto {
  @ApiPropertyOptional({ enum: ['9:16', '1:1'], default: '9:16' })
  @IsOptional()
  @IsEnum(['9:16', '1:1'])
  format?: '9:16' | '1:1';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  addSubtitles?: boolean;

  @ApiPropertyOptional({ enum: ['youtube', 'instagram', 'tiktok'], default: 'youtube' })
  @IsOptional()
  @IsEnum(['youtube', 'instagram', 'tiktok'])
  platform?: 'youtube' | 'instagram' | 'tiktok';
}
