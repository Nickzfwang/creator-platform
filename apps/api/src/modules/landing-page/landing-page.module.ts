import { Module } from '@nestjs/common';
import { LandingPageController } from './landing-page.controller';
import { LandingPageService } from './landing-page.service';

@Module({
  controllers: [LandingPageController],
  providers: [LandingPageService],
})
export class LandingPageModule {}
