import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsDateString,
  IsNumber,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DealType } from '@prisma/client';

export class BrandContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;
}

export class BudgetRangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  max?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateBrandDealDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  brandName: string;

  @ApiProperty({ enum: DealType })
  @IsEnum(DealType)
  dealType: DealType;

  @ApiPropertyOptional({ type: BrandContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandContactDto)
  brandContact?: BrandContactDto;

  @ApiPropertyOptional({ type: BudgetRangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetRangeDto)
  budgetRange?: BudgetRangeDto;

  @ApiPropertyOptional({ description: 'List of deliverables', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deliverables?: string[];

  @ApiPropertyOptional({ description: 'Timeline start date' })
  @IsOptional()
  @IsDateString()
  timelineStart?: string;

  @ApiPropertyOptional({ description: 'Timeline end date' })
  @IsOptional()
  @IsDateString()
  timelineEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
