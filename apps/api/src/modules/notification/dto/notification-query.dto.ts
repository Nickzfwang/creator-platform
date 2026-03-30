import {
  IsOptional,
  IsString,
  IsBooleanString,
  IsNumberString,
} from 'class-validator';

export class NotificationQueryDto {
  @IsString()
  @IsOptional()
  cursor?: string;

  @IsNumberString()
  @IsOptional()
  limit?: string;

  @IsBooleanString()
  @IsOptional()
  unreadOnly?: string;
}
