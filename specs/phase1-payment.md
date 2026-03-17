# Stripe Subscription 訂閱付費模組 — 規格文檔

> Phase: 1 | Priority: P0 | Status: draft

## 概述
訂閱付費模組管理平台的 SaaS 計費，透過 Stripe 處理訂閱生命週期。提供四種方案（Free / Starter / Pro / Business），每種方案含不同的功能額度（影片數、貼文數、Bot 訊息數、品牌合作數）。模組負責建立 Stripe Checkout Session、處理 Webhook 事件、追蹤用量並在各模組執行前檢查額度。

## 依賴關係
- **前置模組**: Auth (1.1) — 需用戶身份
- **使用的共用元件**: `JwtAuthGuard`, `TenantInterceptor`, `PrismaService`, `UsageLimitGuard` (本模組提供)
- **外部服務**: Stripe (Products, Prices, Checkout Sessions, Customer Portal, Webhooks)

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `Subscription`, `UsageRecord`
相關 Enums: `SubscriptionPlan`, `SubscriptionStatus`

```prisma
enum SubscriptionPlan {
  FREE
  STARTER
  PRO
  BUSINESS
}

enum SubscriptionStatus {
  ACTIVE
  TRIALING
  PAST_DUE
  CANCELLED
}

model Subscription {
  id                    String              @id @default(cuid())
  tenantId              String              @unique
  userId                String
  plan                  SubscriptionPlan    @default(FREE)
  stripeCustomerId      String?             @unique
  stripeSubscriptionId  String?             @unique
  status                SubscriptionStatus  @default(ACTIVE)
  currentPeriodStart    DateTime            @default(now())
  currentPeriodEnd      DateTime?
  cancelAtPeriodEnd     Boolean             @default(false)
  usage                 Json                @default("{}")
  // usage structure: { videosUsed: number, postsUsed: number, botMessagesUsed: number, brandDealsUsed: number }
  limits                Json
  // limits structure: { videosPerMonth: number, postsPerMonth: number, botMessagesPerMonth: number, brandDealsPerMonth: number }

  user                  User                @relation(fields: [userId], references: [id])
  tenant                Tenant              @relation(fields: [tenantId], references: [id])

  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  @@index([stripeCustomerId])
  @@index([stripeSubscriptionId])
}

model UsageRecord {
  id          String   @id @default(cuid())
  tenantId    String
  type        String   // 'video' | 'post' | 'bot_message' | 'brand_deal'
  resourceId  String?  // 關聯的資源 ID
  timestamp   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId, type, timestamp])
}
```

## 方案定義

| Plan | 月費 | Videos/mo | Posts/mo | Bot msgs/mo | Brand deals/mo | Stripe Price ID |
|------|------|-----------|----------|-------------|----------------|-----------------|
| Free | $0 | 3 | 30 | 100 | 1 | — (no Stripe) |
| Starter | $29 | 15 | 150 | 1,000 | 5 | `price_starter_monthly` |
| Pro | $79 | 50 | 500 | 5,000 | 20 | `price_pro_monthly` |
| Business | $199 | Unlimited | Unlimited | Unlimited | Unlimited | `price_business_monthly` |

```typescript
// Plan limits configuration (apps/api/src/modules/payment/constants/plan-limits.ts)
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE:     { videosPerMonth: 3,    postsPerMonth: 30,   botMessagesPerMonth: 100,   brandDealsPerMonth: 1  },
  STARTER:  { videosPerMonth: 15,   postsPerMonth: 150,  botMessagesPerMonth: 1000,  brandDealsPerMonth: 5  },
  PRO:      { videosPerMonth: 50,   postsPerMonth: 500,  botMessagesPerMonth: 5000,  brandDealsPerMonth: 20 },
  BUSINESS: { videosPerMonth: -1,   postsPerMonth: -1,   botMessagesPerMonth: -1,    brandDealsPerMonth: -1 }, // -1 = unlimited
};
```

## API Endpoints

### `GET /api/v1/subscriptions/plans`
- **描述**: 列出所有可用方案及其價格與額度
- **認證**: Public（讓未登入用戶也能查看方案）
- **Response** `200`:
```typescript
{
  plans: {
    id: SubscriptionPlan;
    name: string;
    price: number;          // 月費 (USD cents)
    currency: 'usd';
    interval: 'month';
    limits: {
      videosPerMonth: number;
      postsPerMonth: number;
      botMessagesPerMonth: number;
      brandDealsPerMonth: number;
    };
    features: string[];     // 方案特色描述列表
    stripePriceId: string | null;
    recommended: boolean;   // Pro 為推薦方案
  }[];
}
```

### `GET /api/v1/subscriptions/current`
- **描述**: 取得當前訂閱狀態與用量
- **認證**: Required
- **Response** `200`:
```typescript
{
  subscription: {
    id: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
  usage: {
    videosUsed: number;
    videosLimit: number;      // -1 = unlimited
    postsUsed: number;
    postsLimit: number;
    botMessagesUsed: number;
    botMessagesLimit: number;
    brandDealsUsed: number;
    brandDealsLimit: number;
  };
  percentages: {
    videos: number;           // 0-100, null if unlimited
    posts: number;
    botMessages: number;
    brandDeals: number;
  };
}
```
- **Errors**: `401`

### `POST /api/v1/subscriptions/checkout`
- **描述**: 建立 Stripe Checkout Session 進行訂閱 / 升級
- **認證**: Required
- **Request Body**:
```typescript
{
  planId: 'STARTER' | 'PRO' | 'BUSINESS';
  successUrl?: string;      // 預設 /settings/billing?success=true
  cancelUrl?: string;       // 預設 /settings/billing?cancelled=true
}
```
- **Response** `200`:
```typescript
{
  checkoutUrl: string;      // Stripe Checkout Session URL
  sessionId: string;
}
```
- **Business Logic**:
  1. 檢查用戶是否已有 Stripe Customer，若無則建立
  2. 若用戶已有 active subscription 且要升級/降級，使用 Stripe Subscription update（proration）
  3. 若用戶為 Free plan（無 Stripe subscription），建立新 Checkout Session
  4. 設定 `metadata: { tenantId, userId }` 供 webhook 識別
- **Errors**: `400` 已是相同方案 / `401`

### `POST /api/v1/subscriptions/portal`
- **描述**: 建立 Stripe Customer Portal session（帳單管理、取消訂閱）
- **認證**: Required
- **Response** `200`:
```typescript
{
  portalUrl: string;
}
```
- **Business Logic**:
  1. 取得用戶的 `stripeCustomerId`
  2. 呼叫 `stripe.billingPortal.sessions.create`
  3. 設定 `return_url` 為 `/settings/billing`
- **Errors**: `400` Free plan 用戶無 Stripe Customer / `401`

### `POST /api/v1/webhooks/stripe`
- **描述**: 處理 Stripe Webhook 事件
- **認證**: Stripe Signature 驗證（`stripe-signature` header）
- **Content-Type**: `application/json` (raw body)
- **處理的事件**:

#### `checkout.session.completed`
1. 從 `metadata` 取得 `tenantId`, `userId`
2. 取得 Stripe Subscription 詳情
3. 更新 Subscription record：plan, stripeSubscriptionId, status, currentPeriodEnd
4. 重設 usage counters

#### `invoice.paid`
1. 從 subscription 取得 tenantId
2. 更新 `currentPeriodEnd`
3. 重設月度 usage counters（新週期開始）

#### `customer.subscription.updated`
1. 同步 plan 變更（升級/降級）
2. 更新 status（active, past_due, trialing）
3. 若降級，更新 limits

#### `customer.subscription.deleted`
1. 將 subscription status 設為 `CANCELLED`
2. 將 plan 降為 `FREE`
3. 更新 limits 為 Free plan limits

#### `invoice.payment_failed`
1. 更新 status 為 `PAST_DUE`
2. 觸發通知（email / in-app）提醒用戶更新付款方式

- **Response**: `200` (always, 避免 Stripe retry)
- **Errors**: `400` signature 驗證失敗

## Business Logic

### Usage Tracking 用量追蹤
1. 各模組在執行 billable action 時呼叫 `PaymentService.recordUsage(tenantId, type, resourceId)`
2. `recordUsage` 在 `UsageRecord` 表新增記錄，並更新 `Subscription.usage` JSON
3. 用量計算基於 `currentPeriodStart` 到 `currentPeriodEnd` 區間的 UsageRecord count

**觸發點**:
- Video 模組：影片上傳成功時 → `type: 'video'`
- Post Scheduler：貼文建立時 → `type: 'post'`
- Bot 模組：每則對話回覆時 → `type: 'bot_message'`
- Brand Deal：建立合作案時 → `type: 'brand_deal'`

### Usage Limit Check 額度檢查
```typescript
// UsageLimitGuard — 可在各模組的 Controller 上使用
@UseGuards(JwtAuthGuard, UsageLimitGuard)
@UsageType('video')  // custom decorator
@Post('upload')
async uploadVideo() { ... }
```

1. `UsageLimitGuard` 從 JWT 取得 `tenantId`
2. 查詢 `Subscription` 的 `limits` 與 `usage`
3. 若 `limits[type] !== -1 && usage[type] >= limits[type]` → throw `ForbiddenException` with message "Plan limit reached for {type}"
4. 回傳的 HTTP response 包含 `X-Usage-{Type}` 和 `X-Limit-{Type}` headers

**邊界條件**:
- Free plan 用戶嘗試升級到 Free → 400 "Already on Free plan"
- Webhook 重複事件 → 使用 Stripe event ID 做 idempotency check
- 訂閱過期但用戶仍嘗試操作 → `UsageLimitGuard` 檢查 subscription status
- 降級時用量已超過新方案限制 → 允許保留已有資源，但禁止新增
- `PAST_DUE` 狀態 → 給予 7 天寬限期，期間可繼續使用但顯示警告

### Stripe 初始化設定
```typescript
// Stripe Products & Prices setup script (一次性)
// apps/api/src/modules/payment/scripts/setup-stripe.ts
// 1. Create Product: "Creator Platform Subscription"
// 2. Create Prices: Starter ($29/mo), Pro ($79/mo), Business ($199/mo)
// 3. Configure Customer Portal: allow plan changes, cancellation, invoice history
// 4. Configure Webhooks: endpoint URL + events
```

## 前端頁面

### 方案與帳單頁 (`app/(dashboard)/settings/billing/page.tsx`)
- **功能**: 顯示當前方案、用量統計、方案升降級、帳單管理入口
- **元件**:
  - `Card` — 當前方案摘要卡片（plan name, status, renewal date）
  - `Progress` — 各項用量進度條（videos, posts, bot messages, brand deals）
  - `Card` x4 — 方案選擇卡片（含價格、功能列表、CTA button）
  - `Badge` — 推薦方案標籤（Pro）
  - `Badge` — 當前方案標籤
  - `Button` — "Upgrade" / "Downgrade" / "Manage Billing"
  - `Alert` — PAST_DUE 狀態警告（提醒更新付款方式）
  - `Dialog` — 確認升級/降級（顯示價格變更與 proration）
- **狀態管理**: SWR for subscription data, polling 更新用量
- **互動**:
  - 點擊 Upgrade → 呼叫 `POST /checkout` → redirect 到 Stripe Checkout
  - 點擊 Manage Billing → 呼叫 `POST /portal` → redirect 到 Stripe Customer Portal
  - URL 含 `?success=true` 時顯示成功 toast
  - URL 含 `?cancelled=true` 時顯示取消提示
  - 用量接近 80% 時 Progress 條變為 amber，100% 時變為 red

### 用量提示元件 (`components/usage-warning.tsx`)
- **功能**: 全域用量提醒，在接近或達到限制時顯示
- **觸發條件**: 用量 >= 80% 顯示 warning, >= 100% 顯示 error + upgrade CTA
- **位置**: Dashboard layout 頂部 banner

## 測試案例

### Happy Path
- [ ] Free 用戶升級到 Starter → Checkout Session 建立成功
- [ ] Checkout 完成後 webhook 觸發 → Subscription 更新正確
- [ ] `invoice.paid` → currentPeriodEnd 更新且 usage 重設
- [ ] Starter 升級到 Pro → proration 正確計算
- [ ] Pro 降級到 Starter → 下個週期生效
- [ ] 取消訂閱 → subscription.deleted webhook → 降為 Free
- [ ] UsageLimitGuard 在額度內放行
- [ ] UsageLimitGuard 在額度滿時擋下（403）
- [ ] Customer Portal 連結生成成功
- [ ] 用量統計 API 回傳正確的 used/limit/percentage

### Edge Cases
- [ ] 重複的 webhook event → idempotency 保護，不重複處理
- [ ] webhook signature 驗證失敗 → 400
- [ ] Free plan 用戶存取 portal → 400
- [ ] 已是目標方案 → 400
- [ ] `invoice.payment_failed` → status 更新為 PAST_DUE
- [ ] PAST_DUE 超過 7 天 → 降為 Free（由排程 job 處理）
- [ ] 降級時已用量超過新限制 → 保留現有資源但禁止新增
- [ ] 並發 usage recording → 使用 Prisma transaction 確保 count 正確
- [ ] Stripe API 暫時不可用 → retry with exponential backoff
- [ ] 用戶在 Checkout 頁面關閉瀏覽器 → session 過期，不建立 subscription

### Security
- [ ] Webhook endpoint 驗證 Stripe signature（`stripe.webhooks.constructEvent`）
- [ ] 非 owner 無法存取他人 subscription → 404
- [ ] tenant 隔離：跨 tenant 的 subscription 互不可見
- [ ] Stripe Secret Key 僅存在後端環境變數，前端不可存取
- [ ] Checkout Session 的 `metadata` 由後端設定，前端無法竄改
- [ ] Customer Portal 僅允許查看帳單與管理訂閱，不暴露其他用戶資料
