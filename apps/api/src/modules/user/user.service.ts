import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

const USER_PUBLIC_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  locale: true,
  timezone: true,
  onboardingCompleted: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SOCIAL_ACCOUNT_PUBLIC_SELECT = {
  id: true,
  platform: true,
  platformUsername: true,
  followerCount: true,
  isActive: true,
  lastSyncedAt: true,
  scopes: true,
} as const;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      throw new NotFoundException('errors.user.notFound');
    }

    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    await this.findById(id);

    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName.trim();
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        locale: true,
        timezone: true,
        updatedAt: true,
      },
    });

    this.logger.log(`User ${id} profile updated`);
    return updated;
  }

  async completeOnboarding(id: string, dto: CompleteOnboardingDto) {
    const user = await this.findById(id);

    if (user.onboardingCompleted) {
      throw new ConflictException('errors.user.onboardingCompleted');
    }

    const data: Record<string, unknown> = {
      onboardingCompleted: true,
    };
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.displayName !== undefined) data.displayName = dto.displayName.trim();
    if (dto.timezone !== undefined) data.timezone = dto.timezone;

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        displayName: true,
        role: true,
        onboardingCompleted: true,
        updatedAt: true,
      },
    });

    this.logger.log(`User ${id} completed onboarding`);
    return updated;
  }

  async getSocialAccounts(userId: string) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId },
      select: SOCIAL_ACCOUNT_PUBLIC_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    return { data: accounts };
  }

  async disconnectSocialAccount(userId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { id: true, userId: true },
    });

    if (!account) {
      throw new NotFoundException('errors.user.socialNotFound');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('errors.user.cannotDisconnectOthers');
    }

    await this.prisma.socialAccount.delete({
      where: { id: accountId },
    });

    this.logger.log(`Social account ${accountId} disconnected for user ${userId}`);
    return { message: 'Social account disconnected' };
  }

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: USER_PUBLIC_SELECT,
    });
  }
}
