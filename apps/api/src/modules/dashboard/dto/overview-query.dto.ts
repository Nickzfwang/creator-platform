import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class OverviewQueryDto {
  @ApiPropertyOptional({ enum: ['7d', '30d', '90d'], default: '30d' })
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d';
}
