import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsNumber, IsObject } from 'class-validator';
import { AffiliateEventType } from '@prisma/client';

export class CreateEventDto {
  @ApiProperty({ description: 'Tracking code of the affiliate link' })
  @IsString()
  trackingCode: string;

  @ApiProperty({ enum: ['ADD_TO_CART', 'PURCHASE', 'REFUND'] })
  @IsEnum(AffiliateEventType)
  eventType: AffiliateEventType;

  @ApiPropertyOptional({ description: 'Revenue amount for this event' })
  @IsOptional()
  @IsNumber()
  revenueAmount?: number;

  @ApiPropertyOptional({ description: 'Visitor identifier' })
  @IsOptional()
  @IsString()
  visitorId?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
