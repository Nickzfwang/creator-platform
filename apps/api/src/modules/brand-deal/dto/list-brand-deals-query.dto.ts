import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { DealStatus, DealType } from '@prisma/client';

export class ListBrandDealsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ enum: DealStatus })
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;

  @ApiPropertyOptional({ enum: DealType })
  @IsOptional()
  @IsEnum(DealType)
  dealType?: DealType;

  @ApiPropertyOptional({ description: 'Search by brand name' })
  @IsOptional()
  @IsString()
  search?: string;
}
