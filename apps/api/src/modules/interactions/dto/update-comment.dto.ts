import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { CommentCategory } from '@prisma/client';

export class UpdateCommentDto {
  @ApiPropertyOptional({ description: '最終回覆內容' })
  @IsOptional()
  @IsString()
  finalReply?: string;

  @ApiPropertyOptional({ description: '是否已回覆' })
  @IsOptional()
  @IsBoolean()
  isReplied?: boolean;

  @ApiPropertyOptional({ enum: CommentCategory })
  @IsOptional()
  @IsEnum(CommentCategory)
  category?: CommentCategory;
}
