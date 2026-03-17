import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MembershipService } from './membership.service';

@ApiTags('Membership')
@ApiBearerAuth()
@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Post('tiers')
  @ApiOperation({ summary: 'Create a new membership tier' })
  async createTier(
    @Body()
    body: {
      name: string;
      price: number;
      currency: string;
      benefits: string[];
    },
  ) {
    return this.membershipService.createTier(body);
  }

  @Get('tiers')
  @ApiOperation({ summary: 'List all membership tiers' })
  async getTiers() {
    return this.membershipService.getTiers();
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe a user to a membership tier' })
  async subscribe(@Body() body: { tierId: string; userId: string }) {
    return this.membershipService.subscribe(body);
  }
}
