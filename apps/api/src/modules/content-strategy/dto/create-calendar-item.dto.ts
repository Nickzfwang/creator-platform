import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class CreateCalendarItemDto {
  @ApiProperty({ description: '主題標題', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '排程日期 ISO date', example: '2026-04-01' })
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional({ description: '排程時間 HH:mm', example: '09:00' })
  @IsOptional()
  @IsString()
  scheduledTime?: string;

  @ApiPropertyOptional({ description: '目標平台', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetPlatforms?: string[];

  @ApiPropertyOptional({ description: '備註' })
  @IsOptional()
  @IsString()
  notes?: string;
}
