import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUrl } from 'class-validator';

export class CreatePortalDto {
  @ApiPropertyOptional({ description: 'URL to return to after portal session' })
  @IsOptional()
  @IsUrl()
  returnUrl?: string;
}
