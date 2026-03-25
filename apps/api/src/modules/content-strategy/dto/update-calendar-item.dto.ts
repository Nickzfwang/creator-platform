import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional, IsArray, IsEnum, IsUUID, IsInt, IsNumber, MaxLength, Min } from 'class-validator';
import { CalendarItemStatus } from '@prisma/client';

export class UpdateCalendarItemDto {
  @ApiPropertyOptional({ description: '主題標題', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '排程日期 ISO date' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ description: '排程時間 HH:mm' })
  @IsOptional()
  @IsString()
  scheduledTime?: string;

  @ApiPropertyOptional({ description: '目標平台', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetPlatforms?: string[];

  @ApiPropertyOptional({ enum: CalendarItemStatus })
  @IsOptional()
  @IsEnum(CalendarItemStatus)
  status?: CalendarItemStatus;

  @ApiPropertyOptional({ description: '關聯影片 ID' })
  @IsOptional()
  @IsUUID()
  videoId?: string;

  @ApiPropertyOptional({ description: '備註' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: '實際觀看數' })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualViews?: number;

  @ApiPropertyOptional({ description: '實際按讚數' })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualLikes?: number;

  @ApiPropertyOptional({ description: '實際留言數' })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualComments?: number;

  @ApiPropertyOptional({ description: '實際互動率' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualEngagement?: number;
}
