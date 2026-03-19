import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsEmail, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DigitalProductService } from './digital-product.service';

class CreateProductDto {
  @IsString() name: string;
  @IsString() @IsOptional() description?: string;
  @IsString() productType: string;
  @IsNumber() @Type(() => Number) price: number;
  @IsNumber() @Type(() => Number) @IsOptional() compareAtPrice?: number;
  @IsArray() @IsOptional() tags?: string[];
  @IsString() @IsOptional() coverImageUrl?: string;
  @IsString() @IsOptional() fileUrl?: string;
}

class UpdateProductDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @Type(() => Number) @IsOptional() price?: number;
  @IsNumber() @Type(() => Number) @IsOptional() compareAtPrice?: number;
  @IsBoolean() @IsOptional() isPublished?: boolean;
  @IsString() @IsOptional() coverImageUrl?: string;
  @IsString() @IsOptional() fileUrl?: string;
  @IsArray() @IsOptional() tags?: string[];
}

class PurchaseDto {
  @IsEmail() buyerEmail: string;
  @IsString() @IsOptional() buyerName?: string;
}

@ApiTags('Digital Products')
@Controller('v1/products')
export class DigitalProductController {
  constructor(private readonly productService: DigitalProductService) {}

  // ─── Creator endpoints (auth required) ───

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a digital product' })
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(userId, tenantId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my products' })
  async list(@CurrentUser('id') userId: string) {
    return this.productService.list(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get product detail with orders' })
  async getById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) productId: string,
  ) {
    return this.productService.getById(productId, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(productId, userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) productId: string,
  ) {
    return this.productService.delete(productId, userId);
  }

  @Post(':id/ai-regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI regenerate product description' })
  async aiRegenerate(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) productId: string,
  ) {
    return this.productService.aiRegenerate(productId, userId);
  }

  // ─── Public endpoints (no auth) ───

  @Get('store/:userId')
  @ApiOperation({ summary: 'Get public product store for a creator' })
  async publicStore(@Param('userId') userId: string) {
    return this.productService.getPublicProducts(userId);
  }

  @Post(':id/purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purchase a product (simplified)' })
  async purchase(
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: PurchaseDto,
  ) {
    return this.productService.purchase(productId, dto.buyerEmail, dto.buyerName);
  }
}
