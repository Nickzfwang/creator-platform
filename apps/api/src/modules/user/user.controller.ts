import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.userService.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  @Post('me/onboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete onboarding' })
  async completeOnboarding(
    @CurrentUser('id') userId: string,
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.userService.completeOnboarding(userId, dto);
  }

  @Get('me/social-accounts')
  @ApiOperation({ summary: 'List connected social accounts' })
  async getSocialAccounts(@CurrentUser('id') userId: string) {
    return this.userService.getSocialAccounts(userId);
  }

  @Delete('me/social-accounts/:id')
  @ApiOperation({ summary: 'Disconnect a social account' })
  async disconnectSocialAccount(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) accountId: string,
  ) {
    return this.userService.disconnectSocialAccount(userId, accountId);
  }
}
