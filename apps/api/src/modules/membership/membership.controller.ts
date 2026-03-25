import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MembershipService } from './membership.service';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Membership')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  // ─── Tier Management (Creator) ───

  @Post('tiers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new membership tier' })
  async createTier(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateTierDto,
  ) {
    return this.membershipService.createTier(userId, tenantId, dto);
  }

  @Get('tiers')
  @ApiOperation({ summary: 'List creator\'s membership tiers (with member count)' })
  async getTiers(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.membershipService.getTiers(userId, tenantId);
  }

  @Get('tiers/public/:creatorUserId')
  @ApiOperation({ summary: 'List public active tiers for a creator (fan-facing)' })
  async getPublicTiers(
    @CurrentUser('tenantId') tenantId: string,
    @Param('creatorUserId', ParseUUIDPipe) creatorUserId: string,
  ) {
    return this.membershipService.getPublicTiers(creatorUserId, tenantId);
  }

  @Patch('tiers/:id')
  @ApiOperation({ summary: 'Update a membership tier' })
  async updateTier(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTierDto,
  ) {
    return this.membershipService.updateTier(userId, tenantId, id, dto);
  }

  @Delete('tiers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a membership tier (only if no active members)' })
  async deleteTier(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.membershipService.deleteTier(userId, tenantId, id);
  }

  // ─── Subscribe (Fan) ───

  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Subscribe to a membership tier' })
  async subscribe(
    @CurrentUser('id') fanUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: SubscribeDto,
  ) {
    return this.membershipService.subscribe(fanUserId, tenantId, dto);
  }

  // ─── Members List (Creator) ───

  @Get('members')
  @ApiOperation({ summary: 'List members subscribed to your tiers (creator view)' })
  async getMembers(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ListMembersQueryDto,
  ) {
    return this.membershipService.getMembers(userId, tenantId, query);
  }

  // ─── My Memberships (Fan) ───

  @Get('my')
  @ApiOperation({ summary: 'List my memberships as a fan' })
  async getMyMemberships(
    @CurrentUser('id') fanUserId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.membershipService.getMyMemberships(fanUserId, tenantId);
  }

  // ─── Stripe Connect (Creator) ───

  @Post('connect/onboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or resume Stripe Connect onboarding' })
  async createConnectAccount(
    @CurrentUser('id') userId: string,
  ) {
    return this.membershipService.createConnectAccount(userId);
  }

  @Get('connect/status')
  @ApiOperation({ summary: 'Get Stripe Connect account status' })
  async getConnectStatus(
    @CurrentUser('id') userId: string,
  ) {
    return this.membershipService.getConnectStatus(userId);
  }

  // ─── Cancel (Fan) ───

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a membership subscription' })
  async cancelMembership(
    @CurrentUser('id') fanUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.membershipService.cancelMembership(fanUserId, tenantId, id);
  }
}
