import { IsOptional, IsString, IsEnum } from 'class-validator';

export class TrendQueryDto {
  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  @IsOptional()
  phase?: string;
}
