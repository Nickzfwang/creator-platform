import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class IngestContentDto {
  @ApiProperty({ description: 'Text content to ingest' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Source reference (URL, filename, etc.)', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceRef?: string;
}
