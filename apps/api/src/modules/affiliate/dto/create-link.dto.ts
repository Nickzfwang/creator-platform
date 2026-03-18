import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUrl, IsOptional, IsString, MaxLength, IsNumber, Min, Max } from 'class-validator';

export class CreateLinkDto {
  @ApiProperty({ description: 'Target URL for the affiliate link' })
  @IsUrl()
  originalUrl: string;

  @ApiPropertyOptional({ description: 'Product name', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  productName?: string;

  @ApiPropertyOptional({ description: 'Commission rate (0-1)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;
}
