import { Prisma, PrismaClient } from '@prisma/client';

const MODELS_WITH_TENANT: Prisma.ModelName[] = [
  'User',
  'SocialAccount',
  'Video',
  'VideoClip',
  'Post',
  'AffiliateLink',
  'AffiliateEvent',
  'KnowledgeBase',
  'BotConfig',
  'Conversation',
  'MembershipTier',
  'Membership',
  'BrandDeal',
  'PlatformAnalytics',
  'Subscription',
];

function hasTenant(model: string | undefined): boolean {
  return !!model && MODELS_WITH_TENANT.includes(model as Prisma.ModelName);
}

/**
 * Creates a Prisma middleware that auto-injects tenantId
 * into all queries for models that have a tenantId field.
 */
export function createTenantMiddleware(
  tenantId: string,
): Prisma.Middleware {
  return async (params, next) => {
    if (!hasTenant(params.model)) {
      return next(params);
    }

    // READ operations
    if (
      ['findFirst', 'findMany', 'count', 'aggregate', 'groupBy'].includes(
        params.action,
      )
    ) {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      params.args.where.tenantId = tenantId;
    }

    // findUnique — need to move to findFirst if adding tenantId breaks unique constraint
    if (params.action === 'findUnique') {
      if (!params.args) params.args = {};
      // Convert to findFirst to add tenantId filter safely
      params.action = 'findFirst' as typeof params.action;
      const where = params.args.where || {};
      // Flatten composite keys for findFirst
      const flatWhere: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(where)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          Object.assign(flatWhere, value);
        } else {
          flatWhere[key] = value;
        }
      }
      flatWhere.tenantId = tenantId;
      params.args.where = flatWhere;
    }

    // CREATE operations
    if (params.action === 'create') {
      if (!params.args) params.args = {};
      if (!params.args.data) params.args.data = {};
      params.args.data.tenantId = tenantId;
    }
    if (params.action === 'createMany') {
      if (!params.args) params.args = {};
      if (Array.isArray(params.args.data)) {
        params.args.data = params.args.data.map(
          (d: Record<string, unknown>) => ({
            ...d,
            tenantId,
          }),
        );
      }
    }

    // UPDATE operations
    if (['update', 'updateMany', 'upsert'].includes(params.action)) {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      params.args.where.tenantId = tenantId;
    }

    // DELETE operations
    if (['delete', 'deleteMany'].includes(params.action)) {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      params.args.where.tenantId = tenantId;
    }

    return next(params);
  };
}
