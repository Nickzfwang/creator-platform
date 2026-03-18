import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUrl } from 'class-validator';
import { SubscriptionPlan } from '@prisma/client';

export class CreateCheckoutDto {
  @ApiProperty({ enum: ['STARTER', 'PRO', 'BUSINESS'] })
  @IsEnum(SubscriptionPlan)
  planId: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Redirect URL after successful checkout' })
  @IsOptional()
  @IsUrl()
  successUrl?: string;

  @ApiPropertyOptional({ description: 'Redirect URL if checkout is cancelled' })
  @IsOptional()
  @IsUrl()
  cancelUrl?: string;
}
