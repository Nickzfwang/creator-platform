import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsNumber, IsString, Min } from 'class-validator';
import { DealStatus } from '@prisma/client';
import { CreateBrandDealDto } from './create-brand-deal.dto';

export class UpdateBrandDealDto extends PartialType(CreateBrandDealDto) {
  @ApiPropertyOptional({ enum: DealStatus })
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;

  @ApiPropertyOptional({ description: 'Actual revenue earned from deal' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualRevenue?: number;

  @ApiPropertyOptional({ description: 'AI-generated proposal text (editable)' })
  @IsOptional()
  @IsString()
  aiProposal?: string;
}
