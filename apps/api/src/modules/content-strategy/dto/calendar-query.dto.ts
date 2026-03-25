import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsEnum } from 'class-validator';
import { CalendarItemStatus } from '@prisma/client';

export class CalendarQueryDto {
  @ApiProperty({ description: '開始日期 ISO date', example: '2026-03-25' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: '結束日期 ISO date', example: '2026-04-25' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ enum: CalendarItemStatus })
  @IsOptional()
  @IsEnum(CalendarItemStatus)
  status?: CalendarItemStatus;
}
