import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

const ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
] as const;

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

export class RequestUploadUrlDto {
  @ApiProperty({ example: 'my-vlog.mp4' })
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({ example: 'video/mp4', enum: ALLOWED_CONTENT_TYPES })
  @IsIn(ALLOWED_CONTENT_TYPES, {
    message: `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
  })
  contentType: string;

  @ApiProperty({ example: 104857600, description: 'File size in bytes (max 5GB)' })
  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE)
  fileSize: number;
}
