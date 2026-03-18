import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn, IsUUID } from 'class-validator';

export class StatsQueryDto {
  @ApiPropertyOptional({ enum: ['7d', '30d', '90d'], default: '30d' })
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d';

  @ApiPropertyOptional({ description: 'Filter stats for a specific link' })
  @IsOptional()
  @IsUUID()
  linkId?: string;
}
