import { IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCustomRssDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsUrl()
  @MaxLength(500)
  url: string;
}
