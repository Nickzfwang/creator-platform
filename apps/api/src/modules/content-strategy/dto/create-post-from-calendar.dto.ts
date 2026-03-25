import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsDateString, ArrayMinSize } from 'class-validator';

export class CreatePostFromCalendarDto {
  @ApiProperty({ description: '貼文內容' })
  @IsString()
  contentText: string;

  @ApiProperty({ description: '發佈平台', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  platforms: string[];

  @ApiPropertyOptional({ description: 'ISO datetime，不提供則使用日曆日期+時間' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
