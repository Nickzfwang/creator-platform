import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class CutFillersDto {
  @ApiProperty({ description: '要移除的 filler mark IDs', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  fillerIds: string[];
}
