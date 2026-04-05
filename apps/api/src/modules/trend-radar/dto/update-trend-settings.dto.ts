import { IsBoolean, IsOptional, IsArray, IsString } from 'class-validator';

export class UpdateTrendSettingsDto {
  @IsBoolean()
  @IsOptional()
  notifyKeywordHit?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyViralAlert?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyDailySummary?: boolean;

  @IsBoolean()
  @IsOptional()
  emailKeywordHit?: boolean;

  @IsBoolean()
  @IsOptional()
  emailViralAlert?: boolean;

  @IsBoolean()
  @IsOptional()
  emailDailySummary?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  preferredPlatforms?: string[];
}
