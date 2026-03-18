import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsEnum,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VideoStatus } from '@prisma/client';

export class ListVideosQueryDto {
  @ApiPropertyOptional({ description: 'Pagination cursor (video ID)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: VideoStatus })
  @IsOptional()
  @IsEnum(VideoStatus)
  status?: VideoStatus;

  @ApiPropertyOptional({ description: 'Search in title/description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'durationSeconds'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'durationSeconds'])
  sortBy?: 'createdAt' | 'durationSeconds' = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
