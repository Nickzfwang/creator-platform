import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { AdminUpdateTenantDto } from './dto/admin-update-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// ─── User-facing Tenant Controller ───

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('v1/tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current tenant info' })
  async getCurrent(@CurrentTenant() tenantId: string) {
    return this.tenantService.findById(tenantId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update tenant settings (CREATOR/ADMIN only)' })
  async updateSettings(
    @CurrentTenant() tenantId: string,
    @CurrentUser('role') role: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenantService.updateSettings(tenantId, role, dto);
  }

  @Get('branding')
  @ApiOperation({ summary: 'Get tenant branding (logo, theme, domain)' })
  async getBranding(@CurrentTenant() tenantId: string) {
    return this.tenantService.getBranding(tenantId);
  }

  @Post('verify-domain')
  @ApiOperation({ summary: 'Verify custom domain DNS configuration' })
  async verifyDomain(
    @CurrentTenant() tenantId: string,
    @Body('domain') domain: string,
  ) {
    return this.tenantService.verifyDomain(tenantId, domain);
  }
}

// ─── Admin Tenant Management Controller ───

@ApiTags('Admin - Tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/admin/tenants')
export class AdminTenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @ApiOperation({ summary: 'List all tenants (admin only)' })
  async listTenants(@Query() query: ListTenantsQueryDto) {
    // TODO: Add ADMIN role guard
    return this.tenantService.listTenants(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant details (admin)' })
  async getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.findById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get tenant usage statistics (admin)' })
  async getTenantStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getTenantStats(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant (admin — plan, domain, branding)' })
  async updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateTenantDto,
  ) {
    return this.tenantService.adminUpdateTenant(id, dto);
  }

  @Get(':id/branding')
  @ApiOperation({ summary: 'Get tenant branding config (admin)' })
  async getBranding(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getBranding(id);
  }
}
