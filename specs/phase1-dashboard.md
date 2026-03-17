# Dashboard 儀表板模組 — 規格文檔

> Phase: 1 | Priority: P1 | Status: draft

## 概述
儀表板是創作者登入後的首頁，提供關鍵指標總覽、趨勢圖表、即將發佈的排程貼文，以及常用功能的快速入口。後端彙整來自各模組的數據（粉絲數、觀看數、收入、互動率），前端使用 Recharts 呈現視覺化圖表，幫助創作者快速掌握經營狀況。

## 依賴關係
- **前置模組**: Auth (1.1), Post Scheduler (1.6), Payment (1.7) — 需各模組數據
- **使用的共用元件**: `JwtAuthGuard`, `TenantInterceptor`, `PrismaService`
- **外部服務**: 無直接外部 API 呼叫（資料來自內部模組）

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `PlatformAnalytics`, `SocialAccount`
相關 Enums: 無新增

```prisma
model PlatformAnalytics {
  id              String    @id @default(cuid())
  userId          String
  tenantId        String
  socialAccountId String
  date            DateTime  @db.Date
  followers       Int       @default(0)
  views           Int       @default(0)
  likes           Int       @default(0)
  comments        Int       @default(0)
  shares          Int       @default(0)
  revenue         Decimal   @default(0) @db.Decimal(10, 2)
  engagementRate  Float     @default(0)
  topContent      Json?     // [{ externalId, title, views, likes }]
  rawData         Json?     // 平台 API 原始回應（debug 用）

  user            User      @relation(fields: [userId], references: [id])
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id])

  createdAt       DateTime  @default(now())

  @@unique([socialAccountId, date])
  @@index([tenantId, date])
  @@index([userId, date])
}
```

## API Endpoints

### `GET /api/v1/dashboard/overview`
- **描述**: 取得儀表板總覽數據，含關鍵指標與趨勢
- **認證**: Required
- **Query Parameters**:
```typescript
{
  period?: '7d' | '30d' | '90d';  // 預設 '30d'
}
```
- **Response** `200`:
```typescript
{
  metrics: {
    totalFollowers: number;
    followersChange: number;         // 相較上一期的變化量
    followersChangePercent: number;  // 變化百分比
    totalViews: number;
    viewsChange: number;
    viewsChangePercent: number;
    totalRevenue: number;            // USD cents
    revenueChange: number;
    revenueChangePercent: number;
    avgEngagementRate: number;       // 0-100
    engagementRateChange: number;
  };
  trends: {
    date: string;           // ISO date (YYYY-MM-DD)
    followers: number;
    views: number;
    revenue: number;
    engagementRate: number;
  }[];
  topContent: {
    id: string;
    title: string;
    platform: string;
    views: number;
    likes: number;
    engagementRate: number;
    publishedAt: string;
  }[];
  platformBreakdown: {
    platform: string;
    followers: number;
    views: number;
    revenue: number;
    engagementRate: number;
  }[];
}
```
- **Business Logic**:
  1. 從 `PlatformAnalytics` 取得指定期間的數據
  2. 彙整所有已連結 SocialAccount 的指標（加總 followers, views 等）
  3. 計算與上一期相同天數的變化量與百分比
  4. 趨勢數據按日彙整，每天一個數據點
  5. Top content 取 engagement rate 最高的前 5 筆
  6. 按平台分組計算各項指標
- **Errors**: `401`

### `GET /api/v1/dashboard/recent-posts`
- **描述**: 取得即將發佈的排程貼文
- **認證**: Required
- **Query Parameters**:
```typescript
{
  limit?: number;   // 預設 5，最大 10
}
```
- **Response** `200`:
```typescript
{
  posts: {
    id: string;
    contentText: string | null;
    platforms: { platform: string }[];
    status: PostStatus;
    scheduledAt: string;
    type: PostType;
    mediaUrls: string[];
    thumbnailUrl: string | null;
  }[];
}
```
- **Business Logic**:
  1. 查詢 status 為 `SCHEDULED` 的貼文
  2. 按 `scheduledAt` 升序排列
  3. 僅回傳 `scheduledAt >= now()` 的貼文
  4. 限制回傳數量
- **Errors**: `401`

### `GET /api/v1/dashboard/quick-stats`
- **描述**: 取得今日即時統計快照
- **認證**: Required
- **Response** `200`:
```typescript
{
  today: {
    views: number;
    newFollowers: number;
    revenue: number;
    postsPublished: number;
    botMessages: number;
  };
  subscription: {
    plan: SubscriptionPlan;
    usage: {
      videosUsed: number;
      videosLimit: number;
      postsUsed: number;
      postsLimit: number;
    };
  };
  connectedPlatforms: {
    platform: string;
    username: string;
    connected: boolean;
    lastSyncAt: string | null;
  }[];
}
```
- **Business Logic**:
  1. 今日數據從 `PlatformAnalytics` 取 `date = today` 的記錄
  2. `postsPublished` 從 Post 表計算今日 `publishedAt` 的數量
  3. `botMessages` 從 UsageRecord 計算今日 `type = 'bot_message'` 的數量
  4. Subscription 資訊從 Subscription 表取得
  5. Connected platforms 從 SocialAccount 表取得
- **Errors**: `401`

## Business Logic

### 數據同步機制
Analytics 數據透過排程任務從各平台 API 拉取，非此模組負責（由 Social Account 模組的 sync worker 處理）。Dashboard 模組僅負責查詢與彙整。

### 數據彙整查詢策略
```typescript
// 使用 Prisma raw query 進行高效彙整
// 範例：計算指定期間的每日趨勢
const trends = await prisma.$queryRaw`
  SELECT
    date,
    SUM(followers) as followers,
    SUM(views) as views,
    SUM(revenue::numeric) as revenue,
    AVG(engagement_rate) as engagement_rate
  FROM platform_analytics
  WHERE tenant_id = ${tenantId}
    AND date >= ${startDate}
    AND date <= ${endDate}
  GROUP BY date
  ORDER BY date ASC
`;
```

### 快取策略
1. Overview API 結果快取 5 分鐘（Redis key: `dashboard:overview:{tenantId}:{period}`）
2. Quick stats 快取 1 分鐘
3. 當新的 PlatformAnalytics 寫入時，invalidate 相關快取

**邊界條件**:
- 新用戶無任何數據 → 回傳 0 值與空陣列，前端顯示引導提示
- 僅連結一個平台 → platformBreakdown 只有一筆
- 未連結任何平台 → connectedPlatforms 為空，metrics 全為 0
- 數據同步延遲 → 前端顯示 "Last synced: {time}" 提示
- period 跨越 subscription 週期 → 不影響，Analytics 數據獨立於 subscription

## 前端頁面

### 儀表板總覽頁 (`app/(dashboard)/page.tsx`)
- **功能**: 顯示關鍵指標、趨勢圖表、即將排程、快速操作
- **Layout 結構**:
```
┌─────────────────────────────────────────────────┐
│  Dashboard Overview                    [7d|30d|90d] │
├────────────┬────────────┬────────────┬──────────┤
│ Followers  │ Views      │ Revenue    │ Engage.  │
│ 12,345     │ 45,678     │ $1,234     │ 4.5%     │
│ +12.3%     │ -2.1%      │ +8.7%      │ +0.3%    │
├────────────┴────────────┴────────────┴──────────┤
│                                                   │
│  ┌─ Trend Chart (Recharts) ──────────────────┐   │
│  │  Line/Area chart with multi-metric toggle  │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
├─────────────────────────┬───────────────────────┤
│  Platform Breakdown     │  Upcoming Posts        │
│  ┌ YouTube ─────────┐  │  ┌ Post 1 ──────────┐ │
│  │ 8,000 followers   │  │  │ Tomorrow 10:00AM  │ │
│  │ 30,000 views      │  │  │ YouTube + IG      │ │
│  └───────────────────┘  │  └──────────────────┘ │
│  ┌ Instagram ───────┐  │  ┌ Post 2 ──────────┐ │
│  │ 4,345 followers   │  │  │ Mar 20 2:00PM    │ │
│  │ 15,678 views      │  │  │ Instagram        │ │
│  └───────────────────┘  │  └──────────────────┘ │
├─────────────────────────┴───────────────────────┤
│  Quick Actions                                    │
│  [Upload Video] [Create Post] [Bot Settings] [Analytics] │
└─────────────────────────────────────────────────┘
```

- **元件**:
  - `Card` x4 — 關鍵指標卡片（followers, views, revenue, engagement rate）
    - 含 icon, 數值, 變化百分比（綠色正向 / 紅色負向）
    - 使用 `ArrowUpIcon` / `ArrowDownIcon` 表示趨勢
  - `Tabs` — 期間切換（7d / 30d / 90d）
  - `Recharts.AreaChart` — 趨勢圖表
    - 支援切換顯示 metric（followers / views / revenue / engagement）
    - Tooltip 顯示詳細數值
    - Responsive container 適應容器寬度
  - `Card` — Platform breakdown 卡片
    - 各平台 icon + 關鍵數據
    - `Progress` bar 顯示各平台佔比
  - `Card` — Upcoming posts 列表
    - 各貼文的 thumbnail, platform icons, scheduled time
    - 點擊跳轉到貼文詳情
  - `Button` x4 — Quick action buttons（帶 icon）
  - `Skeleton` — 數據載入中的骨架畫面
  - `Alert` — 引導提示（未連結平台 / 無數據時顯示）

- **狀態管理**:
  - SWR for data fetching（`/dashboard/overview`, `/dashboard/recent-posts`, `/dashboard/quick-stats`）
  - Local state for period selection, chart metric toggle
  - `refreshInterval: 60000` (1 分鐘自動刷新)

- **互動**:
  - 切換期間 → re-fetch overview data
  - 切換圖表 metric → local state toggle（不 re-fetch）
  - 點擊指標卡片 → 跳轉到對應的詳細分析頁（`/analytics`）
  - 點擊 upcoming post → 跳轉到 `/posts/:id`
  - Quick action 點擊 → 路由到對應頁面
  - 下拉刷新（mobile）→ 手動 re-fetch

### 空狀態處理
- **未連結任何平台**: 顯示引導卡片 "Connect your first platform to see analytics"，含 CTA 按鈕到 Settings
- **已連結但無數據**: 顯示 "Data will appear once your first sync completes" + Skeleton
- **部分數據**: 正常顯示已有數據，缺失部分顯示 0

### Responsive 設計
- **Desktop (>= 1024px)**: 4 欄指標卡片，2 欄 breakdown + posts
- **Tablet (768-1023px)**: 2 欄指標卡片，1 欄 breakdown + posts 上下排列
- **Mobile (< 768px)**: 1 欄堆疊，圖表可左右滑動

## 測試案例

### Happy Path
- [ ] Overview API 回傳正確的彙整指標與趨勢數據
- [ ] period 參數正確影響查詢範圍（7d / 30d / 90d）
- [ ] 變化百分比計算正確（與前一期相比）
- [ ] Recent posts API 回傳正確的排程貼文（按時間升序）
- [ ] Quick stats API 回傳今日數據與 subscription 用量
- [ ] 前端指標卡片正確顯示數值與趨勢方向
- [ ] Recharts 圖表正確渲染趨勢數據
- [ ] Platform breakdown 正確分組顯示
- [ ] Quick action buttons 路由正確

### Edge Cases
- [ ] 新用戶無數據 → 所有指標為 0，顯示引導提示
- [ ] 僅有一個平台數據 → platformBreakdown 只有一筆，佔比 100%
- [ ] 昨日無數據但前日有 → 變化百分比基於最近有數據的日期計算
- [ ] 大量數據（90 天 x 多平台）→ 查詢效能在 500ms 內
- [ ] SocialAccount token 過期 → lastSyncAt 停止更新，顯示 warning
- [ ] 同時有 SCHEDULED 和 PUBLISHING 的貼文 → recent-posts 僅回傳 SCHEDULED
- [ ] Subscription 為 PAST_DUE → quick-stats 顯示警告 banner

### Security
- [ ] 非 owner 無法存取他人 dashboard → 401
- [ ] tenant 隔離：跨 tenant 的 analytics 數據互不可見
- [ ] rawData 不透過 API 回傳（僅 internal debug 用）
- [ ] API response 不包含 SocialAccount 的 OAuth token
- [ ] 大量 API 請求 → rate limiting（100 req/min per tenant）
