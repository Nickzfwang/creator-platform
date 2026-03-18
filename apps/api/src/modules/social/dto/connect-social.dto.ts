import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SocialPlatform } from '@prisma/client';

export class ConnectSocialParamDto {
  @ApiProperty({ enum: SocialPlatform, example: 'YOUTUBE' })
  @IsEnum(SocialPlatform)
  platform: SocialPlatform;
}
