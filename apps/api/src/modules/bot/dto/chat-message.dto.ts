import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({ description: 'User message', maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ description: 'Existing conversation ID to continue' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Anonymous visitor ID' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  anonymousId?: string;
}
