import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class AddCompetitorDto {
  @ApiProperty({ description: 'YouTube 頻道 URL', example: 'https://www.youtube.com/@channelname' })
  @IsString()
  @IsUrl({}, { message: '請提供有效的 URL' })
  channelUrl: string;
}
