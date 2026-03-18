import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, IsInt, IsBoolean, IsArray, MaxLength, Min } from 'class-validator';
import { BotAccessTier } from '@prisma/client';

export class CreateTierDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Monthly price in USD' })
  @IsNumber()
  @Min(0)
  priceMonthly: number;

  @ApiPropertyOptional({ description: 'Yearly price in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceYearly?: number;

  @ApiPropertyOptional({ description: 'List of benefits', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

  @ApiPropertyOptional({ enum: BotAccessTier, default: 'FREE' })
  @IsOptional()
  @IsEnum(BotAccessTier)
  botAccessTier?: BotAccessTier;

  @ApiPropertyOptional({ description: 'Maximum members (null = unlimited)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMembers?: number;

  @ApiPropertyOptional({ description: 'Sort order' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
