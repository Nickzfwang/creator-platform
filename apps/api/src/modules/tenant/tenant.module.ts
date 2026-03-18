import { Module } from '@nestjs/common';
import { TenantController, AdminTenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  controllers: [TenantController, AdminTenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
