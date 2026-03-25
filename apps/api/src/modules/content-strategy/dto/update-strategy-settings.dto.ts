import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStrategySettingsDto {
  @ApiPropertyOptional({ description: '內容領域' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  niche?: string;

  @ApiPropertyOptional({ description: '每週影片數量', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(14)
  preferredFrequency?: number;

  @ApiPropertyOptional({ description: '是否啟用每週自動生成', default: true })
  @IsOptional()
  @IsBoolean()
  autoGenerateEnabled?: boolean;

  @ApiPropertyOptional({ description: '自動生成星期 (0=Sun, 1=Mon)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  preferredGenerateDay?: number;

  @ApiPropertyOptional({ description: '自動生成小時 (0-23)', default: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  preferredGenerateHour?: number;
}
