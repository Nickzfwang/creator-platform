import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  IsEnum,
  IsDateString,
  IsUUID,
  IsBoolean,
  ValidateNested,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostType } from '@prisma/client';

export class PlatformConfigDto {
  @ApiProperty({ example: 'YOUTUBE' })
  @IsString()
  platform: string;

  @ApiPropertyOptional()
  @IsOptional()
  config?: Record<string, unknown>;
}

export class CreatePostDto {
  @ApiPropertyOptional({ example: 'Check out my latest video!' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  contentText?: string;

  @ApiPropertyOptional({ example: ['https://s3.amazonaws.com/media/video.mp4'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ description: 'VideoClip ID to import from' })
  @IsOptional()
  @IsUUID()
  clipId?: string;

  @ApiProperty({ type: [PlatformConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlatformConfigDto)
  platforms: PlatformConfigDto[];

  @ApiPropertyOptional({ enum: PostType, default: 'ORIGINAL' })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiPropertyOptional({ description: 'ISO 8601 datetime for scheduling' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  affiliateLinks?: { url: string; label: string }[];

  @ApiPropertyOptional({ example: ['#creator', '#video'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  hashtags?: string[];
}
