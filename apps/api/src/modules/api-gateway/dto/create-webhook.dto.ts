import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUrl, IsArray, IsOptional, MaxLength } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ description: 'Webhook endpoint URL' })
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'Events to subscribe to', type: [String] })
  @IsArray()
  @IsString({ each: true })
  events: string[];

  @ApiPropertyOptional({ description: 'Description', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
