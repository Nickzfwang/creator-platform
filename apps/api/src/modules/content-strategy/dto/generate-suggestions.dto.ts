import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { SuggestionSource } from '@prisma/client';

export class GenerateSuggestionsDto {
  @ApiPropertyOptional({ enum: SuggestionSource, description: '推薦偏好' })
  @IsOptional()
  @IsEnum(SuggestionSource)
  preference?: SuggestionSource;

  @ApiPropertyOptional({ description: '生成數量 (5-10)', default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(10)
  count?: number;

  @ApiPropertyOptional({ description: '內容領域（新用戶需提供）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  niche?: string;
}
