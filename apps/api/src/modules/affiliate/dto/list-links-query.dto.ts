import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListLinksQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Search by product name' })
  @IsOptional()
  @IsString()
  search?: string;
}
