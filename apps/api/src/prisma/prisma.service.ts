import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTenantMiddleware } from '../common/prisma/tenant-extension';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }

  /**
   * Returns a new PrismaClient instance with tenant middleware applied.
   * Use this for tenant-scoped queries in request handlers.
   */
  withTenant(tenantId: string): PrismaClient {
    const client = new PrismaClient();
    client.$use(createTenantMiddleware(tenantId));
    return client;
  }
}
