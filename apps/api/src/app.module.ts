import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { VideoModule } from './modules/video/video.module';
import { PostSchedulerModule } from './modules/post-scheduler/post-scheduler.module';
import { AffiliateModule } from './modules/affiliate/affiliate.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { BotModule } from './modules/bot/bot.module';
import { MembershipModule } from './modules/membership/membership.module';
import { BrandDealModule } from './modules/brand-deal/brand-deal.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PaymentModule } from './modules/payment/payment.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { SocialModule } from './modules/social/social.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ApiGatewayModule } from './modules/api-gateway/api-gateway.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SentryModule } from './sentry/sentry.module';
import { AiModule } from './modules/ai/ai.module';
import { TrendRadarModule } from './modules/trend-radar/trend-radar.module';
import { ContentClipModule } from './modules/content-clip/content-clip.module';
import { AutoBrowseModule } from './modules/auto-browse/auto-browse.module';
import { ShortVideoModule } from './modules/short-video/short-video.module';
import { LandingPageModule } from './modules/landing-page/landing-page.module';
import { DigitalProductModule } from './modules/digital-product/digital-product.module';
import { EmailMarketingModule } from './modules/email-marketing/email-marketing.module';
import { ContentRepurposeModule } from './modules/content-repurpose/content-repurpose.module';
import { ContentStrategyModule } from './modules/content-strategy/content-strategy.module';
import { MonetizeModule } from './modules/monetize/monetize.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { NotificationModule } from './modules/notification/notification.module';
import { BrevoModule } from './modules/brevo/brevo.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    SentryModule,
    AiModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
        },
      }),
    }),
    AuthModule,
    UserModule,
    VideoModule,
    PostSchedulerModule,
    AffiliateModule,
    KnowledgeBaseModule,
    BotModule,
    MembershipModule,
    BrandDealModule,
    AnalyticsModule,
    PaymentModule,
    TenantModule,
    SocialModule,
    DashboardModule,
    ApiGatewayModule,
    TrendRadarModule,
    ContentClipModule,
    AutoBrowseModule,
    ShortVideoModule,
    LandingPageModule,
    DigitalProductModule,
    EmailMarketingModule,
    ContentRepurposeModule,
    ContentStrategyModule,
    MonetizeModule,
    InteractionsModule,
    NotificationModule,
    BrevoModule,
  ],
})
export class AppModule {}
