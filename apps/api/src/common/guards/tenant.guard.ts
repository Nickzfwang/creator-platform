import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // JWT takes priority over header (security: prevent header override)
    const tenantId =
      request.user?.tenantId || request.headers['x-tenant-id'];

    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }

    request.tenantId = tenantId;
    return true;
  }
}
