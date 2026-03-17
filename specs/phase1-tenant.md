# Multi-tenant Infrastructure (1.3) — 規格文檔

> Phase: 1 | Priority: P0 | Status: draft

## 概述
多租戶基礎設施是整個平台資料隔離的核心。每個 Creator 擁有獨立的 Tenant，所有業務資料透過 `tenantId` 進行隔離。本模組實作 Prisma middleware 自動注入 tenant 過濾條件、PostgreSQL Row-Level Security (RLS) 作為第二層防護、以及 Tenant resolver 從 JWT 或 subdomain 解析當前 tenant context。Phase 1 不需前端管理介面，Tenant 在使用者註冊時自動建立。

## 依賴關係
- **前置模組**: Authentication (1.1) — JWT payload 包含 `tenantId`
- **使用的共用元件**: `TenantGuard`, `@CurrentTenant()`, `JwtAuthGuard`, `PrismaService`
- **外部服務**: 無

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `Tenant`，以及所有帶 `tenantId` 欄位的 models
相關 Enums: `TenantPlan`

### Tenant
| Field | Type | 說明 |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Tenant 名稱（通常為 Creator 品牌名） |
| `slug` | VARCHAR(100) | URL-safe 識別符，全域唯一 (`@unique`) |
| `customDomain` | VARCHAR(255)? | 自訂 domain（Phase 2+） |
| `logoUrl` | String? | 品牌 logo URL |
| `themeConfig` | Json? | 主題設定 (colors, fonts)，預設 `{}` |
| `plan` | TenantPlan | `FREE` / `PRO` / `ENTERPRISE` / `WHITELABEL` |
| `stripeCustomerId` | VARCHAR(255)? | Stripe customer for billing |
| `settings` | Json? | 額外設定，預設 `{}` |
| `createdAt` | DateTime | 建立時間 |
| `updatedAt` | DateTime | 更新時間 |

### 帶 tenantId 的 Models（需要 tenant 隔離）
以下所有 models 都有 `tenantId` 欄位及 `@@index([tenantId])` 或複合 index：
- `User` — `@@index([tenantId])`
- `SocialAccount` — `@@index([tenantId, userId])`
- `Video` — `@@index([tenantId, userId, status])`
- `VideoClip` — `@@index([tenantId])`
- `Post` — `@@index([tenantId, userId, status])`
- `AffiliateLink` — `@@index([tenantId, userId])`
- `AffiliateEvent` — `@@index([tenantId, createdAt])`
- `KnowledgeBase` — `@@index([tenantId, userId])`
- `BotConfig` — `@@index([tenantId, userId])`
- `Conversation` — `@@index([tenantId])`
- `MembershipTier` — `@@index([tenantId, userId])`
- `Membership` — `@@index([tenantId, creatorUserId, status])`
- `BrandDeal` — `@@index([tenantId, userId, status])`
- `PlatformAnalytics` — `@@index([tenantId, userId, date])`
- `Subscription` — `@@index([tenantId, userId])`

## API Endpoints

### `GET /api/v1/tenant/current`
- **描述**: 取得當前 tenant 的基本資訊
- **認證**: Required
- **Response** `200`:
```typescript
{
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  logoUrl: string | null;
  plan: TenantPlan;
  settings: Record<string, unknown>;
  createdAt: string;
}
```
- **Errors**: `401 Unauthorized`, `403 Forbidden` (no tenant context)

### `PATCH /api/v1/tenant/settings`
- **描述**: 更新 tenant 設定（僅限 CREATOR 或 ADMIN role）
- **認證**: Required
- **Authorization**: `role === CREATOR || role === ADMIN`
- **Request Body**:
```typescript
// UpdateTenantSettingsDto
{
  name?: string;        // @IsOptional(), @IsString(), @MinLength(2), @MaxLength(100)
  logoUrl?: string;     // @IsOptional(), @IsUrl()
  themeConfig?: {       // @IsOptional(), @IsObject()
    primaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
  };
  settings?: Record<string, unknown>; // @IsOptional(), @IsObject()
}
```
- **Response** `200`:
```typescript
{
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  themeConfig: Record<string, unknown>;
  settings: Record<string, unknown>;
  updatedAt: string;
}
```
- **Errors**:
  - `400 Bad Request` — validation 失敗
  - `403 Forbidden` — role 不是 CREATOR 或 ADMIN

## Business Logic

### Prisma Middleware — Tenant 自動注入
此為本模組最核心的機制，確保所有資料查詢自動套用 tenant 過濾。

**實作位置**: `apps/api/src/common/prisma/tenant.middleware.ts`

```typescript
// Pseudocode for Prisma middleware
function tenantMiddleware(tenantId: string) {
  return async (params: Prisma.MiddlewareParams, next) => {
    const modelsWithTenant = [
      'User', 'SocialAccount', 'Video', 'VideoClip', 'Post',
      'AffiliateLink', 'AffiliateEvent', 'KnowledgeBase',
      'BotConfig', 'Conversation', 'MembershipTier', 'Membership',
      'BrandDeal', 'PlatformAnalytics', 'Subscription'
    ];

    if (!modelsWithTenant.includes(params.model)) {
      return next(params);
    }

    // READ operations: inject where clause
    if (['findUnique', 'findFirst', 'findMany', 'count', 'aggregate'].includes(params.action)) {
      params.args.where = { ...params.args.where, tenantId };
    }

    // CREATE operations: inject tenantId in data
    if (['create', 'createMany'].includes(params.action)) {
      if (params.action === 'create') {
        params.args.data = { ...params.args.data, tenantId };
      }
      if (params.action === 'createMany') {
        params.args.data = params.args.data.map(d => ({ ...d, tenantId }));
      }
    }

    // UPDATE operations: inject where clause
    if (['update', 'updateMany', 'upsert'].includes(params.action)) {
      params.args.where = { ...params.args.where, tenantId };
    }

    // DELETE operations: inject where clause
    if (['delete', 'deleteMany'].includes(params.action)) {
      params.args.where = { ...params.args.where, tenantId };
    }

    return next(params);
  };
}
```

**注意事項**:
- Middleware 在每個 request 開始時透過 `PrismaService` 動態掛載
- `Tenant` model 本身不套用 tenant 過濾（避免遞迴）
- `KnowledgeChunk` 無 tenantId，透過 `KnowledgeBase` 間接隔離
- `findUnique` 使用複合 unique key 時需特別處理

### Prisma Extension 替代方案（推薦）
Prisma 4.16+ 支援 `$extends`，比 middleware 更 type-safe：

```typescript
const prismaWithTenant = (tenantId: string) =>
  prisma.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async create({ args, query }) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        // ... 其他 operations
      },
    },
  });
```

### TenantGuard — Tenant Context 驗證
**現有實作**: `apps/api/src/common/guards/tenant.guard.ts`

```
解析 tenantId 的優先順序：
1. JWT payload → request.user.tenantId（主要來源）
2. HTTP header → x-tenant-id（API 測試或 admin 切換用）
3. Subdomain → {slug}.creator-platform.com → 查 DB 取 tenantId
```

Guard 將解析後的 `tenantId` 掛載到 `request.tenantId`，供 `@CurrentTenant()` decorator 使用。

### Tenant Resolver — Subdomain / Custom Domain
**適用場景**: 粉絲端頁面（`(fan)` route group），不需要 JWT

```typescript
// tenant-resolver.service.ts
@Injectable()
export class TenantResolverService {
  constructor(private prisma: PrismaService) {}

  async resolveFromSlug(slug: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async resolveFromDomain(domain: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { customDomain: domain },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async resolveFromRequest(request: Request): Promise<string> {
    // 1. Try JWT
    if (request.user?.tenantId) return request.user.tenantId;
    // 2. Try header
    if (request.headers['x-tenant-id']) return request.headers['x-tenant-id'];
    // 3. Try subdomain
    const host = request.headers['host'];
    const slug = this.extractSlugFromHost(host);
    if (slug) {
      const tenant = await this.resolveFromSlug(slug);
      return tenant.id;
    }
    throw new ForbiddenException('Unable to resolve tenant context');
  }
}
```

### PostgreSQL Row-Level Security (RLS)
Prisma middleware 提供應用層級的防護，RLS 作為資料庫層級的第二道防線。

**Migration SQL**:
```sql
-- 啟用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
-- ... 所有帶 tenantId 的 table

-- 建立 Policy（以 users 為例）
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- App 在每個 request 設定 tenant context
SET app.current_tenant_id = '{tenantId}';
```

**實作方式**:
1. 在 `PrismaService` 的 `$connect` 或每個 transaction 開始時執行 `SET app.current_tenant_id`
2. RLS policy 使用 `current_setting('app.current_tenant_id')` 比對 `tenant_id` 欄位
3. 需要 bypass RLS 的場景（admin、cross-tenant query）使用 superuser connection

**注意**: Prisma 的 connection pooling 可能影響 RLS session variable。建議：
- 使用 `$transaction` 確保 SET 和 query 在同一 connection
- 或使用 Prisma `$executeRaw` 在每次查詢前 SET

### Seed Script — 預設 Tenant
**檔案**: `apps/api/prisma/seed.ts`

```typescript
async function seed() {
  // 建立 system tenant（平台管理用）
  const systemTenant = await prisma.tenant.upsert({
    where: { slug: 'system' },
    update: {},
    create: {
      name: 'System',
      slug: 'system',
      plan: 'ENTERPRISE',
    },
  });

  // 建立 admin user
  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: systemTenant.id, email: 'admin@creator-platform.com' } },
    update: {},
    create: {
      tenantId: systemTenant.id,
      email: 'admin@creator-platform.com',
      passwordHash: await bcrypt.hash('ChangeMe123!', 12),
      displayName: 'System Admin',
      role: 'ADMIN',
      onboardingCompleted: true,
    },
  });

  // 建立 demo tenant（開發測試用）
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo-creator' },
    update: {},
    create: {
      name: 'Demo Creator',
      slug: 'demo-creator',
      plan: 'PRO',
    },
  });

  console.log('Seed completed:', { systemTenant, adminUser, demoTenant });
}
```

### Tenant 建立流程（在 Auth 模組的 register 中觸發）
1. 從 `displayName` 生成 slug：`slugify(displayName, { lower: true, strict: true })`
2. 檢查 slug 唯一性，若衝突則附加 random suffix（`-xxxx`）
3. 建立 Tenant record（plan: FREE）
4. 建立 User record with `tenantId`
5. 以上在同一個 `prisma.$transaction` 中完成

**邊界條件**:
- slug 生成：CJK 字元需要 transliteration（e.g. `你好` → `ni-hao`），或使用 UUID-based slug
- slug 最大長度 100，超過截斷
- customDomain 在 Phase 1 不實作，僅保留欄位
- themeConfig JSON validation — 限制允許的 key/value（防止 XSS in theme values）
- 一個 User 只屬於一個 Tenant（1:N, Tenant has many Users）
- Plan 升降級透過 Stripe webhook 處理（Phase 2）

## 前端頁面
Phase 1 不需要獨立的 Tenant 管理前端頁面。Tenant 相關設定整合在：
- **使用者設定頁面** (`app/(dashboard)/settings/page.tsx`) — 品牌名稱、logo 設定
- **Admin 管理後台** (`app/(admin)/`) — Phase 3 實作

### Frontend Tenant Context
前端需要的 tenant 機制：
- **Middleware** (`middleware.ts`): 從 subdomain 解析 tenant slug，注入 header
- **React Context** (`TenantProvider`): 儲存當前 tenant info，提供 `useTenant()` hook
- **API Client**: 自動在所有 request header 附加 `x-tenant-id`（若需要）

## 需要建立的檔案

### Backend
| 檔案 | 說明 |
|---|---|
| `apps/api/src/common/prisma/tenant.middleware.ts` | Prisma tenant 自動注入 middleware |
| `apps/api/src/common/prisma/prisma.service.ts` | 擴展 PrismaService 支援 tenant context |
| `apps/api/src/modules/tenant/tenant-resolver.service.ts` | Tenant 解析邏輯 (JWT / subdomain / domain) |
| `apps/api/src/modules/tenant/dto/update-tenant-settings.dto.ts` | UpdateTenantSettingsDto |
| `apps/api/src/modules/tenant/tenant.service.ts` | 實作 TODO stubs |
| `apps/api/src/modules/tenant/tenant.controller.ts` | 加入 `@CurrentTenant()` |
| `apps/api/prisma/seed.ts` | Seed script |
| `apps/api/prisma/migrations/xxx_enable_rls.sql` | RLS migration |
| `apps/api/src/modules/tenant/__tests__/tenant.service.spec.ts` | Unit tests |
| `apps/api/src/common/prisma/__tests__/tenant.middleware.spec.ts` | Middleware tests |

### Frontend
| 檔案 | 說明 |
|---|---|
| `apps/web/lib/tenant-context.tsx` | TenantProvider + useTenant hook |
| `apps/web/middleware.ts` | Subdomain tenant resolution (Next.js middleware) |

## 測試案例

### Happy Path
- [ ] `GET /tenant/current` 回傳正確的 tenant 資訊
- [ ] `PATCH /tenant/settings` CREATOR role 成功更新 tenant name
- [ ] `PATCH /tenant/settings` ADMIN role 成功更新 themeConfig
- [ ] Prisma middleware 在 `findMany` 自動注入 tenantId filter
- [ ] Prisma middleware 在 `create` 自動注入 tenantId 到 data
- [ ] Prisma middleware 在 `update` 自動注入 tenantId 到 where
- [ ] Prisma middleware 在 `delete` 自動注入 tenantId 到 where
- [ ] TenantGuard 從 JWT payload 正確解析 tenantId
- [ ] TenantGuard 從 `x-tenant-id` header 正確解析
- [ ] Seed script 成功建立 system tenant + admin user + demo tenant
- [ ] 註冊新使用者時自動建立 Tenant with slug

### Edge Cases
- [ ] 無 tenant context 的 request → TenantGuard 回傳 403
- [ ] Tenant slug 衝突時自動加 suffix
- [ ] CJK displayName 的 slug 生成（transliteration 或 fallback UUID）
- [ ] `Tenant` model 查詢不套用 tenant middleware（避免遞迴）
- [ ] `KnowledgeChunk` 無 tenantId，不受 middleware 影響
- [ ] `findUnique` 使用 composite unique key 時 middleware 正確處理
- [ ] 空 themeConfig → 使用預設值 `{}`
- [ ] `PATCH /tenant/settings` 嘗試更新 plan → 被忽略（plan 只能透過 Stripe 變更）
- [ ] `PATCH /tenant/settings` 嘗試更新 slug → 被忽略（slug 不可變更）
- [ ] `createMany` 批次建立時每筆資料都注入 tenantId

### Security
- [ ] User A 無法查詢 User B 所屬 tenant 的資料（應用層 middleware 隔離）
- [ ] RLS policy 在資料庫層級阻擋 cross-tenant access
- [ ] FAN role 無法存取 `PATCH /tenant/settings` → 403
- [ ] `x-tenant-id` header 無法覆蓋 JWT 中的 tenantId（JWT 優先）
- [ ] themeConfig 中的 string value 不允許 `<script>` 或其他 XSS payload
- [ ] SQL injection 透過 slug/domain 參數 → Prisma parameterized query 防護
- [ ] RLS bypass 僅限 superuser connection，應用層無法繞過
- [ ] Seed script 的 admin 密碼在 production 部署後必須更改
