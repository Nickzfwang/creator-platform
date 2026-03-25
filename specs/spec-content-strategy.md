# AI 內容策略引擎 — 技術規格文檔

> Phase: 5 | Priority: P0 | Status: draft
> PRD: specs/prd-content-strategy.md

## 概述

整合頻道歷史表現（analytics）、外部趨勢（trend-radar）、競品數據（YouTube Data API），透過 GPT-4o 生成結構化的影片主題建議。建議可排入內容日曆，串接 post-scheduler 排程發佈。系統追蹤「建議→採用→發佈→成效」完整閉環，持續優化推薦品質。

## 依賴關係

- **前置模組**: Auth (1.1), User (1.2), Analytics (2.5), TrendRadar
- **串接模組**: PostScheduler（排程發佈）, Dashboard（提示卡片）
- **使用的共用元件**: JwtAuthGuard, PrismaService, @CurrentUser()
- **外部服務**: OpenAI (GPT-4o, GPT-4o-mini), YouTube Data API v3
- **佇列**: BullMQ (`content-strategy` queue)
- **排程**: @nestjs/schedule（每週自動生成、每日競品同步）

## Database Models

### 新增 Enums

```prisma
enum CalendarItemStatus {
  SUGGESTED      // AI 建議草稿
  PLANNED        // 已確認排入日曆
  IN_PRODUCTION  // 製作中
  PUBLISHED      // 已發佈
  MEASURED       // 已有成效數據
  DISMISSED      // 已忽略
  SKIPPED        // 已跳過
}

enum SuggestionSource {
  HISTORY      // 頻道歷史數據
  TREND        // 外部趨勢
  COMPETITOR   // 競品分析
  MIXED        // 綜合
}

enum ConfidenceLevel {
  HIGH
  MEDIUM
  LOW
}
```

### 新增 Model: TopicSuggestion

```prisma
model TopicSuggestion {
  id                String           @id @default(uuid()) @db.Uuid
  userId            String           @map("user_id") @db.Uuid
  tenantId          String           @map("tenant_id") @db.Uuid
  batchId           String           @map("batch_id") @db.Uuid       // 同一次生成的建議共用 batchId
  title             String           @db.VarChar(500)
  description       String                                            // 主題簡述
  reasoning         String                                            // 推薦理由（引用具體數據）
  dataSource        SuggestionSource @map("data_source")
  performanceScore  Float            @map("performance_score")        // 1-10
  confidenceLevel   ConfidenceLevel  @map("confidence_level")
  confidenceReason  String?          @map("confidence_reason")
  suggestedDate     DateTime?        @map("suggested_date") @db.Date
  suggestedPlatforms String[]        @map("suggested_platforms")
  tags              String[]
  relatedTrends     String[]         @map("related_trends")
  competitorRef     String?          @map("competitor_ref")           // 競品影片 URL
  isAdopted         Boolean          @default(false) @map("is_adopted")
  isDismissed       Boolean          @default(false) @map("is_dismissed")
  createdAt         DateTime         @default(now()) @map("created_at")

  user              User             @relation(fields: [userId], references: [id])
  tenant            Tenant           @relation(fields: [tenantId], references: [id])
  calendarItem      ContentCalendar?

  @@index([tenantId, userId, createdAt(sort: Desc)])
  @@index([batchId])
  @@map("topic_suggestions")
}
```

### 新增 Model: ContentCalendar

```prisma
model ContentCalendar {
  id                String             @id @default(uuid()) @db.Uuid
  userId            String             @map("user_id") @db.Uuid
  tenantId          String             @map("tenant_id") @db.Uuid
  suggestionId      String?            @unique @map("suggestion_id") @db.Uuid  // 來源追蹤
  title             String             @db.VarChar(500)
  description       String?
  status            CalendarItemStatus @default(SUGGESTED)
  scheduledDate     DateTime           @map("scheduled_date") @db.Date
  scheduledTime     String?            @map("scheduled_time") @db.VarChar(5)   // "09:00" HH:mm
  targetPlatforms   String[]           @map("target_platforms")
  videoId           String?            @map("video_id") @db.Uuid              // 關聯實際影片
  postId            String?            @map("post_id") @db.Uuid               // 關聯排程 Post
  notes             String?
  actualViews       Int?               @map("actual_views")                    // 實際觀看數（MEASURED）
  actualLikes       Int?               @map("actual_likes")
  actualComments    Int?               @map("actual_comments")
  actualEngagement  Float?             @map("actual_engagement")               // 實際互動率
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")

  user              User               @relation(fields: [userId], references: [id])
  tenant            Tenant             @relation(fields: [tenantId], references: [id])
  suggestion        TopicSuggestion?   @relation(fields: [suggestionId], references: [id])

  @@index([tenantId, userId, scheduledDate])
  @@index([status])
  @@map("content_calendar")
}
```

### 新增 Model: Competitor

```prisma
model Competitor {
  id                String            @id @default(uuid()) @db.Uuid
  userId            String            @map("user_id") @db.Uuid
  tenantId          String            @map("tenant_id") @db.Uuid
  platform          String            @default("YOUTUBE") @db.VarChar(50)
  channelId         String            @map("channel_id") @db.VarChar(255)     // YouTube channel ID
  channelUrl        String            @map("channel_url")                      // 原始 URL
  channelName       String            @map("channel_name") @db.VarChar(255)
  channelAvatar     String?           @map("channel_avatar")
  subscriberCount   Int?              @map("subscriber_count")
  videoCount        Int?              @map("video_count")
  isActive          Boolean           @default(true) @map("is_active")
  lastSyncedAt      DateTime?         @map("last_synced_at")
  createdAt         DateTime          @default(now()) @map("created_at")
  updatedAt         DateTime          @updatedAt @map("updated_at")

  user              User              @relation(fields: [userId], references: [id])
  tenant            Tenant            @relation(fields: [tenantId], references: [id])
  videos            CompetitorVideo[]

  @@unique([userId, channelId])
  @@index([tenantId, userId])
  @@map("competitors")
}
```

### 新增 Model: CompetitorVideo

```prisma
model CompetitorVideo {
  id              String     @id @default(uuid()) @db.Uuid
  competitorId    String     @map("competitor_id") @db.Uuid
  platformVideoId String     @map("platform_video_id") @db.VarChar(255)   // YouTube video ID
  title           String     @db.VarChar(500)
  description     String?
  thumbnailUrl    String?    @map("thumbnail_url")
  viewCount       Int?       @map("view_count")
  likeCount       Int?       @map("like_count")
  commentCount    Int?       @map("comment_count")
  publishedAt     DateTime   @map("published_at")
  durationSeconds Int?       @map("duration_seconds")
  tags            String[]
  createdAt       DateTime   @default(now()) @map("created_at")

  competitor      Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)

  @@unique([competitorId, platformVideoId])
  @@index([competitorId, publishedAt(sort: Desc)])
  @@map("competitor_videos")
}
```

### 修改現有 Models

**User** — 新增 relations：
```prisma
model User {
  // ... existing fields
  topicSuggestions  TopicSuggestion[]
  calendarItems     ContentCalendar[]
  competitors       Competitor[]
}
```

**Tenant** — 新增 relations：
```prisma
model Tenant {
  // ... existing fields
  topicSuggestions  TopicSuggestion[]
  calendarItems     ContentCalendar[]
}
```

---

## API Endpoints

### AI 主題推薦

#### `POST /api/v1/content-strategy/suggestions/generate`
- **描述**: 手動觸發 AI 主題推薦生成
- **認證**: Required
- **Request Body**:
```typescript
{
  preference?: 'HISTORY' | 'TREND' | 'COMPETITOR' | 'MIXED';  // 預設 MIXED
  count?: number;         // 5-10, 預設 7
  niche?: string;         // 新用戶需提供（科技/生活/商業/教育/娛樂...）
}
```
- **Response** `201`:
```typescript
{
  batchId: string;
  suggestions: TopicSuggestionResponse[];
  generatedAt: string;
}

interface TopicSuggestionResponse {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  dataSource: 'HISTORY' | 'TREND' | 'COMPETITOR' | 'MIXED';
  performanceScore: number;       // 1-10
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReason: string;
  suggestedDate: string | null;
  suggestedPlatforms: string[];
  tags: string[];
  relatedTrends: string[];
  competitorRef: string | null;
  createdAt: string;
}
```
- **Business Logic**:
  1. 並行收集數據：analytics.getTopContent() + analytics.getOverview() + trendRadar.getTrends() + competitor videos
  2. 組裝 context → GPT-4o 生成結構化建議
  3. 檢查近 30 天建議，去重（title embedding 相似度 > 0.85 視為重複）
  4. 批次寫入 TopicSuggestion，共用 batchId
- **Errors**: `400` 新用戶未提供 niche, `401`, `429` Rate limit (每小時最多 5 次)

#### `GET /api/v1/content-strategy/suggestions`
- **描述**: 列出主題建議（cursor-based 分頁）
- **認證**: Required
- **Query**: cursor, limit (1-50, default 20), batchId?, dismissed (boolean, default false)
- **Response** `200`: `{ data: TopicSuggestionResponse[], nextCursor, hasMore }`

#### `POST /api/v1/content-strategy/suggestions/:id/adopt`
- **描述**: 採用建議 → 排入內容日曆
- **認證**: Required
- **Request Body**:
```typescript
{
  scheduledDate: string;          // ISO date "2026-04-01"
  scheduledTime?: string;         // "09:00"
  targetPlatforms?: string[];     // 覆蓋建議的平台
}
```
- **Response** `201`:
```typescript
{
  suggestion: TopicSuggestionResponse;  // isAdopted: true
  calendarItem: CalendarItemResponse;
}
```
- **Business Logic**: 建立 ContentCalendar (status: PLANNED, suggestionId 關聯), 更新 suggestion.isAdopted = true

#### `POST /api/v1/content-strategy/suggestions/:id/dismiss`
- **描述**: 忽略建議
- **認證**: Required
- **Response** `200`: `{ id, isDismissed: true }`

#### `POST /api/v1/content-strategy/suggestions/:id/replace`
- **描述**: 「換一個」— 針對單個建議重新生成
- **認證**: Required
- **Response** `200`: 新的 TopicSuggestionResponse（取代原建議，原建議標記 dismissed）

### 內容日曆

#### `GET /api/v1/content-strategy/calendar`
- **描述**: 取得日曆項目（依日期範圍）
- **認證**: Required
- **Query**:
```typescript
{
  startDate: string;    // ISO date "2026-03-25"
  endDate: string;      // ISO date "2026-04-25"
  status?: CalendarItemStatus;
}
```
- **Response** `200`:
```typescript
{
  items: CalendarItemResponse[];
}

interface CalendarItemResponse {
  id: string;
  title: string;
  description: string | null;
  status: CalendarItemStatus;
  scheduledDate: string;
  scheduledTime: string | null;
  targetPlatforms: string[];
  suggestion: TopicSuggestionResponse | null;   // 來源建議
  videoId: string | null;
  postId: string | null;
  notes: string | null;
  actualViews: number | null;
  actualLikes: number | null;
  actualComments: number | null;
  actualEngagement: number | null;
  createdAt: string;
  updatedAt: string;
}
```

#### `POST /api/v1/content-strategy/calendar`
- **描述**: 手動新增日曆項目（非 AI 建議）
- **認證**: Required
- **Request Body**:
```typescript
{
  title: string;               // max 500
  description?: string;
  scheduledDate: string;       // ISO date
  scheduledTime?: string;      // "HH:mm"
  targetPlatforms?: string[];
  notes?: string;
}
```
- **Response** `201`: CalendarItemResponse (status: PLANNED)

#### `PATCH /api/v1/content-strategy/calendar/:id`
- **描述**: 更新日曆項目（標題、日期、狀態、筆記等）
- **認證**: Required
- **Request Body**:
```typescript
{
  title?: string;
  description?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  targetPlatforms?: string[];
  status?: CalendarItemStatus;
  videoId?: string;            // 關聯實際影片
  notes?: string;
}
```
- **Response** `200`: CalendarItemResponse
- **Business Logic**:
  - 狀態轉換驗證：
    - SUGGESTED → PLANNED / DISMISSED
    - PLANNED → IN_PRODUCTION / SKIPPED
    - IN_PRODUCTION → PUBLISHED（需關聯 videoId）
    - PUBLISHED → MEASURED（填入實際成效數據）
  - 更新 scheduledDate 時驗證日期有效性

#### `DELETE /api/v1/content-strategy/calendar/:id`
- **描述**: 刪除日曆項目
- **認證**: Required
- **Business Logic**: PUBLISHED / MEASURED 項目不可刪除
- **Response** `204`

#### `POST /api/v1/content-strategy/calendar/:id/create-post`
- **描述**: 將日曆項目送入 post-scheduler 建立排程 Post
- **認證**: Required
- **Request Body**:
```typescript
{
  contentText: string;        // 貼文內容
  platforms: string[];        // 發佈平台
  scheduledAt?: string;       // ISO datetime, 不提供則使用日曆日期+時間
}
```
- **Response** `201`:
```typescript
{
  calendarItemId: string;
  postId: string;
  status: string;
}
```
- **Business Logic**: 呼叫 PostSchedulerService.create()，更新日曆項目 postId

### 競品追蹤

#### `POST /api/v1/content-strategy/competitors`
- **描述**: 新增競品頻道追蹤
- **認證**: Required
- **Request Body**:
```typescript
{
  channelUrl: string;    // YouTube 頻道 URL（支援多種格式：/channel/、/@、/c/）
}
```
- **Response** `201`:
```typescript
{
  id: string;
  channelId: string;
  channelName: string;
  channelAvatar: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  recentVideos: CompetitorVideoResponse[];  // 最新 10 支
}
```
- **Business Logic**:
  1. 解析 URL → 取得 YouTube channel ID
  2. YouTube Data API: channels.list → 頻道資訊
  3. YouTube Data API: search.list → 最近 50 支影片
  4. YouTube Data API: videos.list → 影片詳情（觀看數等）
  5. 批次寫入 Competitor + CompetitorVideo
- **Errors**: `400` Invalid URL, `404` Channel not found, `409` Already tracking, `403` Quota exceeded (Free: 3, Starter: 5, Pro/Business: 10)

#### `GET /api/v1/content-strategy/competitors`
- **描述**: 列出已追蹤的競品頻道
- **認證**: Required
- **Response** `200`:
```typescript
{
  competitors: CompetitorResponse[];
  quota: { used: number; max: number };
}

interface CompetitorResponse {
  id: string;
  channelId: string;
  channelUrl: string;
  channelName: string;
  channelAvatar: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  lastSyncedAt: string | null;
  recentVideoCount: number;        // 近 30 天影片數
  avgViews: number | null;         // 近 30 天平均觀看
}
```

#### `GET /api/v1/content-strategy/competitors/:id/videos`
- **描述**: 取得競品頻道的影片列表
- **認證**: Required
- **Query**: cursor, limit (1-50, default 20)
- **Response** `200`:
```typescript
{
  data: CompetitorVideoResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CompetitorVideoResponse {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishedAt: string;
  durationSeconds: number | null;
  tags: string[];
}
```

#### `DELETE /api/v1/content-strategy/competitors/:id`
- **描述**: 取消追蹤競品頻道（級聯刪除 CompetitorVideo）
- **認證**: Required
- **Response** `204`

#### `GET /api/v1/content-strategy/competitors/analysis`
- **描述**: AI 分析競品趨勢摘要
- **認證**: Required
- **Response** `200`:
```typescript
{
  analysis: string;              // AI 生成的 Markdown 格式分析
  topTopics: string[];           // 競品近期熱門主題
  opportunities: string[];       // 差異化機會
  generatedAt: string;
}
```
- **Business Logic**: 聚合所有競品近 30 天影片 → GPT-4o-mini 分析

### 策略回顧

#### `GET /api/v1/content-strategy/review`
- **描述**: 取得策略回顧數據
- **認證**: Required
- **Query**: period ('month' | 'quarter', default 'month'), startDate?
- **Response** `200`:
```typescript
{
  period: { start: string; end: string };
  summary: {
    totalSuggested: number;
    totalAdopted: number;
    adoptionRate: number;           // 0-1
    totalPublished: number;
    totalMeasured: number;
    avgPredictionAccuracy: number;  // 預估 vs 實際的相關性 0-1
  };
  topPerformers: {
    calendarItemId: string;
    title: string;
    predictedScore: number;
    actualViews: number;
    actualEngagement: number;
  }[];
  sourceBreakdown: {
    source: SuggestionSource;
    count: number;
    adoptionRate: number;
    avgActualViews: number | null;
  }[];
  dailyTrend: {
    date: string;
    suggested: number;
    adopted: number;
    published: number;
  }[];
}
```

#### `GET /api/v1/content-strategy/review/insights`
- **描述**: AI 生成的策略洞察報告
- **認證**: Required
- **Query**: period ('month' | 'quarter', default 'month')
- **Response** `200`:
```typescript
{
  insights: string;        // Markdown 格式的 AI 洞察報告
  recommendations: string[]; // 具體策略建議（3-5 條）
  generatedAt: string;
}
```
- **Business Logic**: 彙總回顧數據 → GPT-4o-mini 分析產出洞察

### 自動生成

#### `GET /api/v1/content-strategy/settings`
- **描述**: 取得內容策略設定
- **認證**: Required
- **Response** `200`:
```typescript
{
  niche: string | null;
  preferredFrequency: number;     // 每週幾支, default 3
  autoGenerateEnabled: boolean;   // 每週自動生成, default true
  preferredGenerateDay: number;   // 0-6 (Sunday-Saturday), default 1 (Monday)
  preferredGenerateHour: number;  // 0-23, default 9
}
```

#### `PATCH /api/v1/content-strategy/settings`
- **描述**: 更新策略設定
- **認證**: Required
- **Request Body**: 同 Response 結構（所有欄位 optional）
- **Response** `200`: 更新後的設定
- **Business Logic**: 設定存於 User.metadata JSON 欄位（新增 `contentStrategy` key）

---

## Business Logic

### 1. AI 主題推薦生成流程

```
POST /suggestions/generate
       │
       ▼
ContentStrategyService.generateSuggestions(userId, tenantId, dto)
       │
       ├─ 1. 並行收集數據：
       │   ├─ analyticsService.getTopContent(userId, tenantId, '90d', 20)
       │   ├─ analyticsService.getOverview(userId, tenantId, '30d')
       │   ├─ trendRadarService.getTrends(niche)
       │   └─ competitorService.getRecentVideos(userId)   // 所有競品近 30 天
       │
       ├─ 2. 組裝 AI Context:
       │   ├─ 歷史表現摘要（Top 10 影片標題+觀看數+互動率）
       │   ├─ 頻道整體趨勢（粉絲成長、觀看趨勢、最佳平台）
       │   ├─ 外部熱門趨勢（Top 20 話題+分數）
       │   ├─ 競品近期內容（標題+觀看數，Top 30）
       │   └─ 偏好設定（preference, niche, frequency）
       │
       ├─ 3. GPT-4o 生成（aiService.generateJson<T>）:
       │   ├─ System prompt: 內容策略顧問角色
       │   ├─ User message: context + 生成要求
       │   └─ 回傳: TopicSuggestion[] JSON
       │
       ├─ 4. 去重檢查:
       │   ├─ 查詢近 30 天的 TopicSuggestion
       │   ├─ 對每個新建議 title → aiService.generateEmbedding()
       │   ├─ 與已有建議的 title embedding 做 cosine similarity
       │   └─ > 0.85 的建議標記並要求 AI 替換
       │
       └─ 5. 批次寫入 DB (共用 batchId)
```

### 2. AI Prompt 設計

**主題推薦 System Prompt (GPT-4o):**

```typescript
const systemPrompt = `你是一位資深的 YouTube 內容策略顧問，專門幫助創作者規劃影片主題。

你的分析框架：
1. 數據驅動：根據頻道歷史表現，找出觀眾偏好的內容類型
2. 趨勢嗅覺：從當前熱門話題中找出與創作者 niche 相關的切入點
3. 競品洞察：分析同領域創作者的成功內容，找出差異化機會
4. 時效性：考慮話題的時間窗口，優先推薦有時效性的主題

輸出要求：
- 每個建議必須附上具體的推薦理由（引用數據來源）
- performanceScore 基於：歷史同類內容表現 + 趨勢熱度 + 競品驗證
- confidenceLevel 基於：數據支撐程度（多個來源交叉驗證 = HIGH）
- suggestedDate 考慮：話題時效性 + 創作者發佈節奏

回傳 JSON 格式：
{
  "suggestions": [
    {
      "title": "影片標題建議",
      "description": "2-3 句主題簡述",
      "reasoning": "推薦理由（引用具體數據）",
      "dataSource": "HISTORY|TREND|COMPETITOR|MIXED",
      "performanceScore": 8.5,
      "confidenceLevel": "HIGH|MEDIUM|LOW",
      "confidenceReason": "信心依據說明",
      "suggestedDate": "2026-04-01",
      "suggestedPlatforms": ["YOUTUBE"],
      "tags": ["tag1", "tag2"],
      "relatedTrends": ["趨勢話題1"],
      "competitorRef": "https://youtube.com/watch?v=xxx 或 null"
    }
  ]
}`;
```

**競品分析 System Prompt (GPT-4o-mini):**

```typescript
const systemPrompt = `你是一位內容競品分析師。
分析以下同領域創作者的近期影片數據，找出：
1. 熱門主題趨勢（哪些主題觀看數最高）
2. 發佈策略（頻率、時間規律）
3. 差異化機會（競品尚未覆蓋但有潛力的主題）

回傳 Markdown 格式分析報告。`;
```

**策略回顧 Insights Prompt (GPT-4o-mini):**

```typescript
const systemPrompt = `你是一位內容策略分析師。
根據以下數據，產出月度策略洞察報告：
1. 哪類建議（歷史/趨勢/競品）的表現最好？為什麼？
2. AI 預估分數與實際表現的偏差分析
3. 下個月的策略調整建議（3-5 條具體建議）

回傳 JSON：
{
  "insights": "Markdown 格式報告",
  "recommendations": ["建議1", "建議2", ...]
}`;
```

### 3. 每週自動生成 (Cron Job)

```
@Cron('0 * * * 1')  // 每週一每小時檢查一次
ContentStrategyCron.weeklyGenerate()
       │
       ├─ 查詢所有 autoGenerateEnabled = true 的用戶
       ├─ 篩選當前小時 = preferredGenerateHour 的用戶（依用戶 timezone）
       │
       └─ 對每個匹配的用戶：
           ├─ BullMQ: content-strategy queue.add('weekly-generate', { userId, tenantId })
           └─ Worker 處理：
               ├─ 呼叫 generateSuggestions(preference: 'MIXED', count: preferredFrequency + 2)
               ├─ 自動建立 ContentCalendar items (status: SUGGESTED)
               └─ 分配 suggestedDate（根據 preferredFrequency 均勻分佈在本週）
```

### 4. 每日競品同步 (Cron Job)

```
@Cron('0 3 * * *')  // 每天凌晨 3 點
CompetitorSyncCron.dailySync()
       │
       ├─ 查詢所有 isActive = true 的 Competitor
       ├─ 依 lastSyncedAt 排序（最久未同步的優先）
       │
       └─ 對每個競品（追蹤 API quota）：
           ├─ YouTube Data API: search.list → 新影片
           ├─ YouTube Data API: videos.list → 影片詳情
           ├─ Upsert CompetitorVideo records
           ├─ 更新 Competitor.lastSyncedAt
           └─ 若 quota 接近上限 → 中斷，剩餘明天處理
```

### 5. 狀態轉換驗證

```
合法轉換路徑：
SUGGESTED  → PLANNED, DISMISSED
PLANNED    → IN_PRODUCTION, SKIPPED
IN_PRODUCTION → PUBLISHED (requires videoId)
PUBLISHED  → MEASURED (requires actual metrics)

不可逆操作：
DISMISSED, SKIPPED 為終態
PUBLISHED, MEASURED 不可刪除
```

### 6. 邊界條件

- 新用戶（無歷史數據）→ 必須提供 niche，只用趨勢+公開競品數據生成
- 無競品追蹤 → 跳過競品數據，reasoning 中不引用競品
- YouTube API quota 超額 → 競品新增返回 403，同步降級為手動觸發
- GPT-4o 生成失敗 → 重試 2 次，仍失敗返回 500
- 去重後建議不足 → 降低相似度閾值到 0.90 再試一次
- 建議的 suggestedDate 已過 → 自動調整到下一個可用日期
- User.metadata 不存在 contentStrategy key → 使用預設值

---

## 後端模組結構

```
apps/api/src/modules/content-strategy/
├── content-strategy.module.ts
├── content-strategy.controller.ts
├── content-strategy.service.ts          # 主題推薦 + 日曆 + 回顧
├── competitor.service.ts                # 競品追蹤 + YouTube API
├── competitor-sync.processor.ts         # BullMQ Worker: 競品同步
├── content-strategy.processor.ts        # BullMQ Worker: 每週自動生成
├── content-strategy.cron.ts             # Cron jobs
├── constants/
│   └── plan-limits.ts                   # 各方案的競品追蹤上限
└── dto/
    ├── generate-suggestions.dto.ts
    ├── adopt-suggestion.dto.ts
    ├── create-calendar-item.dto.ts
    ├── update-calendar-item.dto.ts
    ├── calendar-query.dto.ts
    ├── add-competitor.dto.ts
    ├── create-post-from-calendar.dto.ts
    └── update-strategy-settings.dto.ts
```

### Plan Limits

```typescript
// constants/plan-limits.ts
export const COMPETITOR_LIMITS = {
  FREE: 3,
  STARTER: 5,
  PRO: 10,
  BUSINESS: 10,
};

export const SUGGESTION_RATE_LIMIT = {
  FREE: 3,       // 每天 3 次
  STARTER: 10,
  PRO: 20,
  BUSINESS: 50,
};
```

---

## 前端頁面

### 內容策略主頁 (`app/(dashboard)/strategy/page.tsx`)

**元件結構**:
```
StrategyPage
├── StrategyTabs
│   ├── Tab: AI 推薦 → SuggestionsPanel
│   │   ├── PreferenceSelector        # [趨勢導向] [數據導向] [競品導向] [綜合]
│   │   ├── SuggestionCard[]          # 主題建議卡片
│   │   │   ├── ScoreBadge            # 預估表現分數 + 信心指標
│   │   │   ├── SourceTag             # 數據來源標籤
│   │   │   ├── ReasoningCollapse     # 展開推薦理由
│   │   │   └── ActionButtons         # [排入日曆] [忽略] [換一個]
│   │   ├── GenerateButton            # [AI 推薦主題] / [重新生成]
│   │   └── EmptyState                # 新用戶引導（選擇 niche）
│   │
│   ├── Tab: 內容日曆 → CalendarPanel
│   │   ├── ViewToggle                # [月] [週]
│   │   ├── CalendarGrid              # 日曆格（可拖拉）
│   │   │   └── CalendarItemCard      # 項目卡片（顏色=狀態）
│   │   ├── ItemDetailSheet           # 側邊抽屜：編輯詳情
│   │   │   ├── StatusStepper         # 狀態進度條
│   │   │   ├── LinkVideoSelect       # 關聯影片
│   │   │   └── CreatePostButton      # 建立排程 Post
│   │   └── AddItemButton             # [+ 手動新增]
│   │
│   ├── Tab: 競品追蹤 → CompetitorPanel
│   │   ├── CompetitorList            # 已追蹤頻道卡片
│   │   │   └── CompetitorCard        # 頭像 + 名稱 + 統計
│   │   ├── CompetitorVideos          # 選中頻道的影片列表
│   │   ├── CompetitorAnalysis        # AI 分析摘要（Markdown）
│   │   ├── AddCompetitorDialog       # 新增頻道（URL 輸入）
│   │   └── QuotaIndicator            # 已用/上限
│   │
│   └── Tab: 策略回顧 → ReviewPanel
│       ├── PeriodSelector            # [本月] [上月] [本季]
│       ├── SummaryCards              # 總覽卡片（建議數、採用率、準確度）
│       ├── PerformanceChart          # 建議表現 vs 頻道平均（Recharts AreaChart）
│       ├── SourceBreakdownChart      # 各數據來源的成效比較（Recharts BarChart）
│       └── InsightsReport            # AI 洞察報告（Markdown 渲染）
```

**shadcn/ui 元件**:
- Tabs, TabsContent, TabsList, TabsTrigger
- Card, CardContent, CardHeader, CardFooter
- Button, Badge, Checkbox
- Calendar（日曆基礎）
- Sheet（側邊抽屜）
- Dialog（新增競品、編輯）
- Select, Input, Textarea
- Collapsible（展開推薦理由）
- Progress（信心指標）
- Skeleton（loading state）
- Alert（空狀態、錯誤提示）
- Tooltip（分數說明）

**狀態管理**:
```typescript
// hooks/use-content-strategy.ts

// 主題建議
const useSuggestions = (params) =>
  useQuery(['suggestions', params], () => api.get('/content-strategy/suggestions', { params }));

const useGenerateSuggestions = () =>
  useMutation((dto) => api.post('/content-strategy/suggestions/generate', dto));

const useAdoptSuggestion = () =>
  useMutation(({ id, dto }) => api.post(`/content-strategy/suggestions/${id}/adopt`, dto));

// 內容日曆
const useCalendar = (startDate, endDate) =>
  useQuery(['calendar', startDate, endDate], () =>
    api.get('/content-strategy/calendar', { params: { startDate, endDate } }));

const useUpdateCalendarItem = () =>
  useMutation(({ id, dto }) => api.patch(`/content-strategy/calendar/${id}`, dto));

// 競品
const useCompetitors = () =>
  useQuery(['competitors'], () => api.get('/content-strategy/competitors'));

const useCompetitorVideos = (id) =>
  useQuery(['competitor-videos', id], () => api.get(`/content-strategy/competitors/${id}/videos`));

// 回顧
const useStrategyReview = (period) =>
  useQuery(['strategy-review', period], () => api.get('/content-strategy/review', { params: { period } }));

const useStrategyInsights = (period) =>
  useQuery(['strategy-insights', period], () => api.get('/content-strategy/review/insights', { params: { period } }));
```

### 儀表板提示卡片

在 `app/(dashboard)/page.tsx` 新增：
```
DashboardPage
└── WeeklyPlanCard (NEW)
    ├── 標題：「本週內容計畫已就緒」
    ├── 摘要：N 個主題建議、N 個已排程
    └── [查看計畫] 按鈕 → 導向 /strategy?tab=calendar
```

**顯示條件**: 本週有 status=SUGGESTED 的 ContentCalendar items

---

## 測試案例

### Happy Path
- [ ] POST /suggestions/generate → 生成 5-10 個建議，每個含完整欄位
- [ ] GET /suggestions → cursor-based 分頁正確
- [ ] POST /suggestions/:id/adopt → 建立 CalendarItem + 更新 isAdopted
- [ ] POST /suggestions/:id/dismiss → 更新 isDismissed
- [ ] POST /suggestions/:id/replace → 原建議 dismissed + 新建議生成
- [ ] GET /calendar → 依日期範圍篩選正確
- [ ] POST /calendar → 手動新增項目
- [ ] PATCH /calendar/:id → 更新欄位 + 狀態轉換正確
- [ ] DELETE /calendar/:id → 非 PUBLISHED/MEASURED 可刪除
- [ ] POST /calendar/:id/create-post → 建立排程 Post + 更新 postId
- [ ] POST /competitors → 新增競品頻道 + 抓取影片
- [ ] GET /competitors → 列出所有追蹤頻道 + quota
- [ ] GET /competitors/:id/videos → cursor-based 分頁
- [ ] DELETE /competitors/:id → 級聯刪除 CompetitorVideo
- [ ] GET /competitors/analysis → AI 分析競品趨勢
- [ ] GET /review → 策略回顧數據正確彙總
- [ ] GET /review/insights → AI 洞察報告生成
- [ ] 每週 cron → 自動生成建議 + 建立 SUGGESTED 日曆項目
- [ ] 每日 cron → 競品影片同步更新

### Edge Cases
- [ ] 新用戶無歷史數據 → 純趨勢推薦 + 需要 niche
- [ ] 無競品追蹤 → 建議不含競品類型
- [ ] YouTube API quota 超額 → 競品新增 403 + 同步中斷
- [ ] GPT-4o 生成失敗 → 重試 2 次 + 500 錯誤
- [ ] 去重：近 30 天已有相似建議 → 自動替換
- [ ] 日曆項目狀態不合法轉換 → 400 錯誤
- [ ] PUBLISHED 項目嘗試刪除 → 400 錯誤
- [ ] IN_PRODUCTION → PUBLISHED 未關聯 videoId → 400 錯誤
- [ ] 競品追蹤超過方案上限 → 403 錯誤
- [ ] 建議的 suggestedDate 已過 → 自動調整

### Security
- [ ] 只能存取自己 tenant 的資料（tenantId 過濾）
- [ ] 競品 ownership 驗證（userId）
- [ ] 日曆項目 ownership 驗證
- [ ] API 輸入驗證（class-validator）
- [ ] YouTube API key 不暴露至前端
- [ ] 生成頻率限制（rate limiting per plan）

### PRD 驗收條件對應

| PRD AC | 對應 API / 流程 |
|--------|----------------|
| Story1-AC1 | POST /suggestions/generate + weekly cron |
| Story1-AC2 | TopicSuggestionResponse 結構（title, description, reasoning, score, confidence） |
| Story1-AC3 | generate DTO preference 參數 |
| Story1-AC4 | niche 必填 fallback + 純趨勢推薦 |
| Story2-AC1 | POST /suggestions/:id/adopt → CalendarItem |
| Story2-AC2 | GET /calendar → 月/週視圖 + status 顏色 |
| Story2-AC3 | PATCH /calendar/:id → scheduledDate 更新（前端拖拉） |
| Story2-AC4 | PATCH /calendar/:id → status: IN_PRODUCTION + videoId |
| Story3-AC1 | weekly cron → auto generate + SUGGESTED calendar items |
| Story3-AC2 | Dashboard WeeklyPlanCard |
| Story3-AC3 | DELETE /calendar/:id + POST /suggestions/:id/replace |
| Story4-AC1 | POST /competitors → YouTube Data API fetch |
| Story4-AC2 | GET /competitors + GET /competitors/:id/videos |
| Story4-AC3 | GET /competitors/analysis + suggestion dataSource=COMPETITOR |
| Story4-AC4 | daily cron → competitor sync |
| Story5-AC1 | GET /review → summary + calendarItem actual metrics |
| Story5-AC2 | GET /review/insights → AI 分析報告 |
| Story5-AC3 | GET /review → period 參數 + dailyTrend |
