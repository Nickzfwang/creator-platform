import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsArray, Matches } from 'class-validator';

export class AdoptSuggestionDto {
  @ApiProperty({ description: '排程日期 ISO date', example: '2026-04-01' })
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional({ description: '排程時間 HH:mm', example: '09:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'scheduledTime must be HH:mm format' })
  scheduledTime?: string;

  @ApiPropertyOptional({ description: '目標平台（覆蓋建議）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetPlatforms?: string[];
}
