import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsArray, IsString, IsDateString } from 'class-validator';

export class CreateCampaignFromItemDto {
  @ApiPropertyOptional({ description: '目標訂閱者標籤，空陣列 = 全部', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetTags?: string[];

  @ApiPropertyOptional({ description: '排程時間' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
