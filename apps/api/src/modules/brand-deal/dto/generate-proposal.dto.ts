import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class GenerateProposalDto {
  @ApiProperty({ description: 'Brand deal ID to generate proposal for' })
  @IsString()
  dealId: string;

  @ApiPropertyOptional({
    description: 'Tone of the proposal',
    enum: ['professional', 'friendly', 'creative'],
    default: 'professional',
  })
  @IsOptional()
  @IsIn(['professional', 'friendly', 'creative'])
  tone?: string;

  @ApiPropertyOptional({ description: 'Additional instructions for AI', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  additionalInstructions?: string;
}
