import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, IsOptional, IsDateString, ValidateNested, ArrayMinSize, MaxLength } from 'class-validator';

export class CommentImportItem {
  @ApiProperty({ description: '留言作者名稱' })
  @IsString()
  @MaxLength(255)
  authorName: string;

  @ApiProperty({ description: '留言內容' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: '平台' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '留言時間' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional({ description: '來源 URL' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;
}

export class ImportCommentsDto {
  @ApiProperty({ type: [CommentImportItem] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommentImportItem)
  comments: CommentImportItem[];
}
