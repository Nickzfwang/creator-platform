import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';

@ApiTags('Tenant')
@ApiBearerAuth()
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current tenant info' })
  async getCurrent() {
    // TODO: Extract tenant from @CurrentTenant() decorator
    return this.tenantService.findById('current-tenant-id');
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update tenant settings' })
  async updateSettings(@Body() body: Record<string, unknown>) {
    // TODO: Extract tenant from @CurrentTenant() decorator
    return this.tenantService.updateSettings('current-tenant-id', body);
  }
}
