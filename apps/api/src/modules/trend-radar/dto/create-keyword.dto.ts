import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateKeywordDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  keyword: string;
}
