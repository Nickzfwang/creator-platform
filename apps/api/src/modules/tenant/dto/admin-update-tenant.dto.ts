import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsObject,
  IsEnum,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { TenantPlan } from '@prisma/client';

export class AdminUpdateTenantDto {
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

  @ApiPropertyOptional({ example: 'app.mybrand.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/, {
    message: 'customDomain must be a valid domain name',
  })
  customDomain?: string;

  @ApiPropertyOptional({ enum: TenantPlan })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @ApiPropertyOptional({
    example: {
      primaryColor: '#3b82f6',
      accentColor: '#8b5cf6',
      fontFamily: 'Inter',
    },
  })
  @IsOptional()
  @IsObject()
  themeConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
