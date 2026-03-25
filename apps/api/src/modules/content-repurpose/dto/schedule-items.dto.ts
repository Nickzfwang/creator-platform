import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsUUID, IsOptional, IsDateString, ArrayMinSize } from 'class-validator';

export class ScheduleItemsDto {
  @ApiProperty({ description: '要排程的 item IDs', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  itemIds: string[];

  @ApiPropertyOptional({ description: 'ISO 日期時間，不提供則建立為 DRAFT' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
