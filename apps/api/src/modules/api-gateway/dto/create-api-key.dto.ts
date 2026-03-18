import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Display name for the API key', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Allowed scopes for this key', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}
