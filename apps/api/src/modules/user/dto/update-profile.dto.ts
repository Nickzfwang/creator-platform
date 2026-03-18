import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

const SUPPORTED_LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja'] as const;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nick Wang' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'zh-TW', enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;

  @ApiPropertyOptional({ example: 'Asia/Taipei' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_]+\/[A-Za-z_]+$/, {
    message: 'timezone must be a valid IANA timezone (e.g. Asia/Taipei)',
  })
  timezone?: string;
}
