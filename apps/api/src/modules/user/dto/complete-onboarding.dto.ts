import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { UserRole, SocialPlatform } from '@prisma/client';

export class CompleteOnboardingDto {
  @ApiPropertyOptional({ enum: UserRole, example: 'CREATOR' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 'Nick Wang' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Asia/Taipei' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_]+\/[A-Za-z_]+$/, {
    message: 'timezone must be a valid IANA timezone (e.g. Asia/Taipei)',
  })
  timezone?: string;

  @ApiPropertyOptional({
    enum: SocialPlatform,
    isArray: true,
    example: ['YOUTUBE', 'INSTAGRAM'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(SocialPlatform, { each: true })
  socialPlatforms?: SocialPlatform[];
}
