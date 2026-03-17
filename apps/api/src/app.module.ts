import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot(),
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
  ],
})
export class AppModule {}
