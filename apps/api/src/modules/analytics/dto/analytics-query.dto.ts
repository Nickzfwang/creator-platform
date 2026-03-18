import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn, IsDateString, IsEnum } from 'class-validator';
import { SocialPlatform } from '@prisma/client';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ['7d', '30d', '90d', '365d'], default: '30d' })
  @IsOptional()
  @IsIn(['7d', '30d', '90d', '365d'])
  period?: string;

  @ApiPropertyOptional({ description: 'Custom start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Custom end date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class PlatformAnalyticsQueryDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: SocialPlatform })
  @IsOptional()
  @IsEnum(SocialPlatform)
  platform?: SocialPlatform;
}

export class RevenueAnalyticsQueryDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ['subscription', 'membership', 'affiliate', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['subscription', 'membership', 'affiliate', 'all'])
  source?: string;
}
