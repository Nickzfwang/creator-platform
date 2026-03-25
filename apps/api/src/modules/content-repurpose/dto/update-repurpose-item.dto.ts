import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsObject, IsEnum } from 'class-validator';

export class UpdateRepurposeItemDto {
  @ApiPropertyOptional({ description: '編輯後的內容' })
  @IsOptional()
  @IsObject()
  editedContent?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ['DISCARDED'], description: '標記為棄用' })
  @IsOptional()
  @IsEnum(['DISCARDED'])
  status?: 'DISCARDED';
}
