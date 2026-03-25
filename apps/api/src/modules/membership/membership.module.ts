import { Module } from '@nestjs/common';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

@Module({
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
// ConfigService is available globally via ConfigModule.forRoot({ isGlobal: true })
export class MembershipModule {}
