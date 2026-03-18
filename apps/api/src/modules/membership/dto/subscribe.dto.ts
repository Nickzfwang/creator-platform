import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsUrl } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ description: 'Membership tier ID to subscribe to' })
  @IsUUID()
  tierId: string;

  @ApiPropertyOptional({ description: 'Success redirect URL' })
  @IsOptional()
  @IsUrl()
  successUrl?: string;

  @ApiPropertyOptional({ description: 'Cancel redirect URL' })
  @IsOptional()
  @IsUrl()
  cancelUrl?: string;
}
