import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LandingPageService } from './landing-page.service';

class AiGenerateDto {
  @IsString() creatorName: string;
  @IsString() niche: string;
  @IsString() @IsOptional() description?: string;
  @IsArray() @IsOptional() socialLinks?: Array<{ platform: string; url: string }>;
}

class UpdatePageDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() headline?: string;
  @IsString() @IsOptional() subheadline?: string;
  @IsString() @IsOptional() bio?: string;
  @IsString() @IsOptional() avatarUrl?: string;
  @IsString() @IsOptional() coverUrl?: string;
  @IsString() @IsOptional() theme?: string;
  @IsOptional() colorScheme?: any;
  @IsOptional() socialLinks?: any;
  @IsOptional() ctaButtons?: any;
  @IsOptional() sections?: any;
  @IsString() @IsOptional() customCss?: string;
  @IsBoolean() @IsOptional() isPublished?: boolean;
}

@ApiTags('Landing Page')
@Controller('v1/landing-page')
export class LandingPageController {
  constructor(private readonly lpService: LandingPageService) {}

  // --- Authenticated endpoints ---

  @Post('ai-generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'AI generate a landing page' })
  async aiGenerate(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: AiGenerateDto,
  ) {
    return this.lpService.aiGenerate(userId, tenantId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my landing page' })
  async getMine(@CurrentUser('id') userId: string) {
    return this.lpService.getByUser(userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update landing page' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) pageId: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.lpService.update(pageId, userId, dto);
  }

  @Post(':id/ai-section')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI regenerate a section' })
  async aiSection(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) pageId: string,
    @Body() body: { sectionType: string; context?: string },
  ) {
    return this.lpService.aiRegenerateSection(pageId, userId, body.sectionType, body.context);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete landing page' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) pageId: string,
  ) {
    return this.lpService.delete(pageId, userId);
  }

  // --- Public endpoint ---

  @Get('p/:slug')
  @ApiOperation({ summary: 'View published landing page (public)' })
  async getPublic(@Param('slug') slug: string) {
    return this.lpService.getBySlug(slug);
  }
}
