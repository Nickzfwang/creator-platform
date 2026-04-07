import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: {
    id: string;
    email: string;
    displayName: string;
    tenantId: string;
    role: string;
    onboardingCompleted: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findFirst({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('errors.auth.emailRegistered');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);
    const slug = await this.generateUniqueSlug(dto.displayName);

    const { tenant, user } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.displayName,
          slug,
          plan: 'FREE',
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          displayName: dto.displayName,
          role: 'CREATOR',
        },
      });

      return { tenant, user };
    });

    const tokens = await this.generateTokens(user.id, email, tenant.id, user.role);

    this.logger.log(`User registered: ${email}, tenant: ${tenant.slug}`);

    return {
      ...tokens,
      user: this.formatUser(user),
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('errors.auth.invalidCredentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google sign-in. Please use Google to log in.',
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('errors.auth.invalidCredentials');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.tenantId,
      user.role,
    );

    return {
      ...tokens,
      user: this.formatUser(user),
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.getRefreshTokenSecret(),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException('errors.auth.userNotFound');
      }

      return this.generateTokens(user.id, user.email, user.tenantId, user.role);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('errors.auth.invalidRefreshToken');
    }
  }

  async logout(_refreshToken: string): Promise<void> {
    // With JWT-based refresh tokens, we rely on short expiry.
    // For production, consider a token blocklist in Redis.
    this.logger.log('User logged out');
  }

  async validateGoogleUser(profile: {
    email: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<AuthResponse> {
    const email = profile.email.toLowerCase().trim();

    let user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      const slug = await this.generateUniqueSlug(profile.displayName);

      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const tenant = await tx.tenant.create({
          data: {
            name: profile.displayName,
            slug,
            plan: 'FREE',
          },
        });

        const newUser = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            role: 'CREATOR',
          },
        });

        return { tenant, user: newUser };
      });

      user = result.user;
      this.logger.log(`Google OAuth user created: ${email}`);
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.tenantId,
      user.role,
    );

    return {
      ...tokens,
      user: this.formatUser(user),
    };
  }

  private formatUser(user: {
    id: string;
    email: string;
    displayName: string;
    tenantId: string;
    role: string;
    onboardingCompleted: boolean;
  }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      tenantId: user.tenantId,
      role: user.role,
      onboardingCompleted: user.onboardingCompleted,
    };
  }

  private async generateTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, tenantId, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET', 'change-me'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.getRefreshTokenSecret(),
        expiresIn: `${this.REFRESH_TOKEN_EXPIRY_DAYS}d`,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private getRefreshTokenSecret(): string {
    const jwtSecret = this.configService.get('JWT_SECRET', 'change-me');
    return `${jwtSecret}-refresh`;
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-|-$/g, '') || 'user';

    let slug = baseSlug;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.tenant.findUnique({
        where: { slug },
      });
      if (!existing) return slug;
      slug = `${baseSlug}-${randomUUID().slice(0, 6)}`;
    }
  }
}
