import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export class UpdateClipDto {
  @ApiPropertyOptional({ example: 'Best moment highlight' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'An amazing moment from the stream' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: ['#highlight', '#gaming'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  hashtags?: string[];
}
