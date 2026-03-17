# Post Scheduling 排程發佈模組 — 規格文檔

> Phase: 1 | Priority: P0 | Status: draft

## 概述
排程發佈模組讓創作者可以建立、排程並自動發佈貼文到多個社群平台（YouTube、Instagram）。支援手動建立貼文或從 AI 剪輯影片匯入，透過 GPT-4o 自動生成貼文內容，並使用 BullMQ delayed job 在指定時間自動發佈。模組同時記錄每次發佈結果，處理成功與失敗的情境。

## 依賴關係
- **前置模組**: Auth (1.1), Video Processing (1.4) — 需 VideoClip 作為貼文素材來源
- **使用的共用元件**: `JwtAuthGuard`, `TenantInterceptor`, `PrismaService`, `BullMQ Queue`
- **外部服務**: OpenAI GPT-4o (內容生成), YouTube Data API v3 (影片上傳), Instagram Graph API (Reels/Post 發佈)

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `Post`, `SocialAccount`, `VideoClip`
相關 Enums: `PostType`, `PostStatus`, `Platform`

```prisma
enum PostType {
  ORIGINAL
  CLIP_SHARE
  AFFILIATE
  SPONSORED
}

enum PostStatus {
  DRAFT
  SCHEDULED
  PUBLISHING
  PUBLISHED
  FAILED
  CANCELLED
}

model Post {
  id             String      @id @default(cuid())
  userId         String
  tenantId       String
  contentText    String?     @db.Text
  mediaUrls      String[]
  clipId         String?
  platforms      Json        // [{ platform: "YOUTUBE"|"INSTAGRAM", config: {...} }]
  type           PostType    @default(ORIGINAL)
  aiGenerated    Boolean     @default(false)
  affiliateLinks Json?       // [{ url, label, trackingId }]
  hashtags       String[]
  status         PostStatus  @default(DRAFT)
  scheduledAt    DateTime?
  publishedAt    DateTime?
  errorMessage   String?
  publishResults Json?       // [{ platform, success, externalId, errorDetail }]

  user           User        @relation(fields: [userId], references: [id])
  tenant         Tenant      @relation(fields: [tenantId], references: [id])
  clip           VideoClip?  @relation(fields: [clipId], references: [id])

  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@index([tenantId, status])
  @@index([tenantId, scheduledAt])
  @@index([userId, status])
}
```

## API Endpoints

### `POST /api/v1/posts`
- **描述**: 建立新貼文（草稿或排程）
- **認證**: Required
- **Request Body**:
```typescript
{
  contentText?: string;         // 貼文文字內容
  mediaUrls?: string[];         // S3 媒體檔案 URL 陣列
  clipId?: string;              // 關聯的 VideoClip ID（匯入用）
  platforms: {
    platform: 'YOUTUBE' | 'INSTAGRAM';
    config: {
      // YouTube: { title, description, tags, privacy, categoryId }
      // Instagram: { caption, coverImageUrl, shareToFeed }
    };
  }[];
  type: 'ORIGINAL' | 'CLIP_SHARE' | 'AFFILIATE' | 'SPONSORED';
  scheduledAt?: string;         // ISO 8601，若提供則自動排程
  affiliateLinks?: { url: string; label: string }[];
  hashtags?: string[];
}
```
- **Response** `201`:
```typescript
{
  id: string;
  status: 'DRAFT' | 'SCHEDULED';
  scheduledAt: string | null;
  createdAt: string;
}
```
- **Business Logic**:
  1. 驗證 `clipId` 存在且屬於同 tenant
  2. 若提供 `clipId`，自動填入 `mediaUrls` 從 clip 的 outputUrl
  3. 驗證 `platforms` 中的 SocialAccount 已連結且 token 有效
  4. 檢查用戶 subscription 的 posts/mo 額度
  5. 若 `scheduledAt` 存在且為未來時間，建立 BullMQ delayed job，status 設為 `SCHEDULED`
  6. 若 `scheduledAt` 為空，status 設為 `DRAFT`
- **Errors**: `400` 無效的 platform config / `401` 未認證 / `403` 超出方案額度 / `404` clipId 不存在

### `GET /api/v1/posts`
- **描述**: 列出貼文（含分頁、篩選）
- **認證**: Required
- **Query Parameters**:
```typescript
{
  cursor?: string;              // cursor-based 分頁
  limit?: number;               // 預設 20，最大 50
  status?: PostStatus;          // 篩選狀態
  platform?: 'YOUTUBE' | 'INSTAGRAM';
  dateFrom?: string;            // ISO 8601
  dateTo?: string;              // ISO 8601
  type?: PostType;
}
```
- **Response** `200`:
```typescript
{
  items: Post[];
  nextCursor: string | null;
  total: number;
}
```
- **Errors**: `401`

### `GET /api/v1/posts/:id`
- **描述**: 取得貼文詳情
- **認證**: Required
- **Response** `200`:
```typescript
{
  id: string;
  contentText: string | null;
  mediaUrls: string[];
  clipId: string | null;
  platforms: PlatformConfig[];
  type: PostType;
  aiGenerated: boolean;
  affiliateLinks: AffiliateLink[] | null;
  hashtags: string[];
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  publishResults: PublishResult[] | null;
  createdAt: string;
  updatedAt: string;
}
```
- **Errors**: `401` / `404`

### `PATCH /api/v1/posts/:id`
- **描述**: 更新貼文（僅 DRAFT / SCHEDULED 狀態可更新）
- **認證**: Required
- **Request Body**: 與 `POST /api/v1/posts` 相同欄位（皆為 optional）
- **Response** `200`: 更新後的 Post 物件
- **Business Logic**:
  1. 檢查 status 是否為 `DRAFT` 或 `SCHEDULED`
  2. 若狀態為 `SCHEDULED` 且 `scheduledAt` 被更新，移除舊的 BullMQ job 並建立新的
  3. 若原為 `DRAFT` 且新增 `scheduledAt`，建立 BullMQ delayed job 並更新 status 為 `SCHEDULED`
- **Errors**: `400` 狀態不允許更新 / `401` / `404`

### `DELETE /api/v1/posts/:id`
- **描述**: 刪除貼文（僅 DRAFT / SCHEDULED 狀態可刪除）
- **認證**: Required
- **Response** `204`: No Content
- **Business Logic**:
  1. 檢查 status 為 `DRAFT` 或 `SCHEDULED`
  2. 若為 `SCHEDULED`，從 BullMQ 移除 delayed job
  3. Soft delete（設 deletedAt）或 hard delete
- **Errors**: `400` 狀態不允許刪除 / `401` / `404`

### `POST /api/v1/posts/:id/publish-now`
- **描述**: 立即發佈貼文（跳過排程）
- **認證**: Required
- **Response** `202`:
```typescript
{
  id: string;
  status: 'PUBLISHING';
  message: 'Post queued for immediate publishing';
}
```
- **Business Logic**:
  1. 檢查 status 為 `DRAFT` 或 `SCHEDULED`
  2. 更新 status 為 `PUBLISHING`
  3. 若原為 `SCHEDULED`，移除 BullMQ delayed job
  4. 建立 BullMQ immediate job（delay: 0）
- **Errors**: `400` / `401` / `404`

### `POST /api/v1/posts/ai-generate`
- **描述**: 使用 GPT-4o 生成貼文內容
- **認證**: Required
- **Request Body**:
```typescript
{
  clipId?: string;              // VideoClip ID，用於提取上下文
  platforms: ('YOUTUBE' | 'INSTAGRAM')[];
  tone: 'professional' | 'casual' | 'humorous' | 'educational' | 'promotional';
  additionalContext?: string;   // 用戶自訂提示
  language?: string;            // 預設 'zh-TW'
}
```
- **Response** `200`:
```typescript
{
  suggestions: {
    platform: string;
    contentText: string;
    hashtags: string[];
    title?: string;             // YouTube only
    description?: string;       // YouTube only
  }[];
  tokensUsed: number;
}
```
- **Business Logic**:
  1. 若有 `clipId`，取得 clip 的 transcript 與 metadata 作為上下文
  2. 組合 system prompt：平台特性 + tone + 用戶上下文
  3. 呼叫 GPT-4o 生成每個平台的內容（含 hashtags）
  4. YouTube 內容額外生成 title 和 description
  5. 記錄 token 使用量到 usage tracking
- **Errors**: `400` / `401` / `404` clipId 不存在 / `429` AI 額度已滿

## Business Logic

### 排程發佈流程
1. 用戶建立貼文並設定 `scheduledAt`
2. 系統建立 BullMQ delayed job，delay = `scheduledAt - now()` (ms)
3. Job 到期時，`PostPublishWorker` 被觸發
4. Worker 逐一發佈到各 platform：
   a. 取得對應 SocialAccount 的 OAuth token
   b. 檢查 token 是否過期，若過期嘗試 refresh
   c. 呼叫對應平台 API 發佈
   d. 記錄每個平台的發佈結果到 `publishResults`
5. 全部成功：status → `PUBLISHED`，記錄 `publishedAt`
6. 部分失敗：status → `FAILED`，記錄 `errorMessage` 與各平台結果
7. 用戶可查看失敗原因並重試

**邊界條件**:
- `scheduledAt` 為過去時間 → 拒絕，回傳 400
- 發佈時 OAuth token 失效且 refresh 也失敗 → 標記該平台為 `FAILED`，errorMessage 記錄 "Token expired, please reconnect"
- BullMQ worker crash → 依賴 BullMQ 內建 retry 機制（max 3 attempts, exponential backoff）
- 用戶在 job 執行中取消 → 因 job 已在處理中，無法取消，但前端會顯示最終結果
- 同一貼文重複發佈 → 透過 idempotency key 防止重複

### YouTube 上傳流程
1. 從 S3 下載影片檔（或使用 presigned URL stream）
2. 呼叫 YouTube Data API v3 `videos.insert`（resumable upload）
3. 設定 snippet（title, description, tags, categoryId）
4. 設定 status（privacy: public/unlisted/private）
5. 上傳完成後取得 `videoId`
6. 記錄 `externalId` 到 publishResults

### Instagram Reels/Post 發佈流程
1. 影片需先上傳到可公開存取的 URL（S3 + CloudFront signed URL）
2. 呼叫 Instagram Graph API `POST /{ig-user-id}/media`（建立 media container）
   - 影片: `media_type=REELS`, `video_url`, `caption`
   - 圖片: `media_type=IMAGE`, `image_url`, `caption`
3. 輪詢 container status 直到 `FINISHED`
4. 呼叫 `POST /{ig-user-id}/media_publish` 發佈
5. 記錄 `externalId` 到 publishResults

### AI 最佳發佈時間建議
1. 分析用戶過去 30 天的發佈數據
2. 依 engagement rate 排序各時段
3. 回傳 top 3 建議時段（按平台分別計算）
4. 前端在日曆上標示建議時段

## 前端頁面

### 排程管理頁 (`app/(dashboard)/posts/page.tsx`)
- **功能**: 以日曆或列表檢視所有貼文排程
- **元件**:
  - `Tabs` — 切換日曆 / 列表檢視
  - `Calendar` — 月 / 週 / 日三種模式（使用 `@fullcalendar/react` 或自建）
  - `Badge` — 貼文狀態標籤（顏色區分：DRAFT 灰、SCHEDULED 藍、PUBLISHED 綠、FAILED 紅）
  - `Button` — 新增貼文
  - `DropdownMenu` — 貼文快捷操作（編輯 / 刪除 / 立即發佈）
  - `Dialog` — 確認刪除 / 發佈
- **狀態管理**: SWR for data fetching, local state for calendar view mode
- **互動**:
  - Drag & drop 貼文到新時段 → 呼叫 `PATCH /api/v1/posts/:id` 更新 `scheduledAt`
  - 點擊貼文卡片 → 展開詳情或跳轉編輯頁
  - 篩選: status, platform, date range

### 貼文編輯器 (`app/(dashboard)/posts/new/page.tsx`)
- **功能**: 建立 / 編輯貼文，支援多平台預覽
- **元件**:
  - `Textarea` — 貼文內容輸入
  - `Select` — 平台選擇（多選）
  - `Select` — 貼文類型選擇
  - `DatePicker` + `TimePicker` — 排程時間設定
  - `Card` — 各平台預覽卡片（模擬 YouTube / Instagram 呈現）
  - `Button` — AI 生成內容
  - `Dialog` — AI 生成設定（tone, language, context）
  - `FileUpload` — 媒體檔案上傳（圖片 / 影片）
  - `Input` — Hashtag 輸入（tag input 風格）
  - `Switch` — Affiliate link toggle
- **狀態管理**: React Hook Form + Zod validation, SWR for clip data
- **互動**:
  - 選擇 clipId 後自動填入媒體與 transcript 相關資訊
  - AI 生成按鈕 → 呼叫 `/ai-generate` → 用戶可選用 / 編輯建議內容
  - 平台預覽即時更新（YouTube 預覽含 title + description，Instagram 預覽含 caption + hashtags）
  - 儲存為草稿 / 排程發佈兩個 CTA

## Worker 設計

### PostPublishWorker (`apps/api/src/workers/post-publish.worker.ts`)
```typescript
// Queue name: 'post-publish'
// Job data: { postId: string }
// Concurrency: 5
// Retry: 3 attempts, exponential backoff (1min, 5min, 15min)

interface PostPublishJobData {
  postId: string;
}

// Worker 處理步驟:
// 1. Lock post (optimistic locking via updatedAt)
// 2. Fetch post with relations (socialAccounts)
// 3. For each platform in post.platforms:
//    a. Get SocialAccount + decrypt OAuth token
//    b. Refresh token if expired
//    c. Call platform-specific publisher
//    d. Record result
// 4. Update post status based on results
// 5. Emit event for notification
```

## 測試案例

### Happy Path
- [ ] 建立 DRAFT 貼文，驗證 status 正確
- [ ] 建立 SCHEDULED 貼文，驗證 BullMQ job 已建立
- [ ] 更新 SCHEDULED 貼文的 scheduledAt，驗證舊 job 移除、新 job 建立
- [ ] 刪除 SCHEDULED 貼文，驗證 BullMQ job 已移除
- [ ] publish-now 觸發立即發佈，驗證 job 建立（delay=0）
- [ ] AI 生成內容，驗證回傳格式與各平台內容
- [ ] YouTube 上傳成功，驗證 publishResults 記錄 videoId
- [ ] Instagram Reels 發佈成功，驗證 publishResults 記錄 mediaId
- [ ] 列表 API 支援 cursor 分頁與各種篩選條件
- [ ] 從 clipId 匯入貼文，驗證 mediaUrls 自動填入

### Edge Cases
- [ ] scheduledAt 為過去時間 → 400 Bad Request
- [ ] clipId 不存在 → 404
- [ ] 用戶 posts/mo 額度已滿 → 403
- [ ] 更新 PUBLISHED 狀態的貼文 → 400
- [ ] 刪除 PUBLISHING 狀態的貼文 → 400
- [ ] 多平台發佈部分成功部分失敗 → status 為 FAILED，publishResults 含各平台結果
- [ ] OAuth token 過期且 refresh 失敗 → 對應平台標記失敗
- [ ] BullMQ worker crash 後 retry → 驗證重試行為
- [ ] 同時對同一貼文觸發 publish-now 兩次 → idempotency 保護

### Security
- [ ] 非 owner 無法存取他人貼文 → 404
- [ ] tenant 隔離：不同 tenant 的貼文互不可見
- [ ] JWT 過期 → 401
- [ ] XSS 防護：contentText 中的 HTML 標籤被清理
- [ ] OAuth token 以 AES-256-GCM 加密存儲
