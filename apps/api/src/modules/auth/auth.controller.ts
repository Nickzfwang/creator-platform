import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiProperty,
} from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token or credential from Google Sign-In' })
  @IsString()
  credential: string;
}

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  private readonly googleClient: OAuth2Client | null;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    const googleClientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    this.googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or register with Google credential' })
  @ApiResponse({ status: 200, description: 'Google login successful' })
  @ApiResponse({ status: 400, description: 'Invalid Google credential' })
  async googleLogin(@Body() dto: GoogleLoginDto) {
    if (!this.googleClient) {
      throw new BadRequestException('Google OAuth 尚未設定');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.credential,
        audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload?.email) {
        throw new BadRequestException('Google 帳號缺少 email');
      }

      return this.authService.validateGoogleUser({
        email: payload.email,
        displayName: payload.name || payload.email.split('@')[0],
        avatarUrl: payload.picture,
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Invalid Google credential');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }
}
