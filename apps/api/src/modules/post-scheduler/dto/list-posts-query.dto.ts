import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsEnum,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostStatus, PostType } from '@prisma/client';

export class ListPostsQueryDto {
  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ enum: PostStatus })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @ApiPropertyOptional({ enum: PostType })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiPropertyOptional({ description: 'Filter by platform (in platforms JSON)' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 start date' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 end date' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
