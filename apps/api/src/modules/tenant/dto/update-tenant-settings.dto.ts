import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ example: 'My Brand' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({
    example: { primaryColor: '#3b82f6', accentColor: '#8b5cf6' },
  })
  @IsOptional()
  @IsObject()
  themeConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
