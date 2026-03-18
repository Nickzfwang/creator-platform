import { PartialType } from '@nestjs/swagger';
import { CreateTierDto } from './create-tier.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateTierDto extends PartialType(CreateTierDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
