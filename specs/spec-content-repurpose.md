# AI 內容再利用引擎 — 技術規格文檔

> Phase: 4 | Priority: P0 | Status: draft
> PRD: specs/prd-content-repurpose.md

## 概述

影片處理完成後，自動觸發 AI 內容再利用 pipeline，從影片轉錄稿和摘要生成多平台社群貼文、短影片精華片段建議、Email 會員通知。創作者在前端審核編輯後，一鍵串接排程發佈與 Email 行銷模組。

## 依賴關係

- **前置模組**: Video（影片處理 pipeline）、AI（OpenAI 封裝）
- **串接模組**: PostScheduler（排程發佈）、EmailMarketing（Email 行銷）、ShortVideo（短影片生成）
- **使用的共用元件**: JwtAuthGuard, TenantGuard, PrismaService, @CurrentUser(), @CurrentTenant()
- **外部服務**: OpenAI (GPT-4o, GPT-4o-mini)
- **佇列**: BullMQ (`content-repurpose` queue)

## Database Models

### 新增 Enums

```prisma
enum RepurposeJobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

enum RepurposeItemType {
  SOCIAL_POST
  SHORT_VIDEO_SUGGESTION
  EMAIL
}

enum RepurposeItemStatus {
  GENERATED
  EDITED
  SCHEDULED
  DISCARDED
}
```

### 新增 Model: RepurposeJob

```prisma
model RepurposeJob {
  id          String             @id @default(uuid()) @db.Uuid
  videoId     String             @map("video_id") @db.Uuid
  userId      String             @map("user_id") @db.Uuid
  tenantId    String             @map("tenant_id") @db.Uuid
  status      RepurposeJobStatus @default(PENDING)
  errorMessage String?           @map("error_message")
  completedAt DateTime?          @map("completed_at")
  createdAt   DateTime           @default(now()) @map("created_at")
  updatedAt   DateTime           @updatedAt @map("updated_at")

  video       Video              @relation(fields: [videoId], references: [id])
  user        User               @relation(fields: [userId], references: [id])
  tenant      Tenant             @relation(fields: [tenantId], references: [id])
  items       RepurposeItem[]

  @@unique([videoId])
  @@index([tenantId, userId])
  @@map("repurpose_jobs")
}
```

### 新增 Model: RepurposeItem

```prisma
model RepurposeItem {
  id              String              @id @default(uuid()) @db.Uuid
  jobId           String              @map("job_id") @db.Uuid
  type            RepurposeItemType
  status          RepurposeItemStatus @default(GENERATED)
  platform        String?             @db.VarChar(50)   // YOUTUBE, INSTAGRAM, etc.
  style           String?             @db.VarChar(50)   // knowledge, story, interactive
  originalContent Json                @map("original_content")  // AI 原始生成內容
  editedContent   Json?               @map("edited_content")    // 使用者編輯後內容
  metadata        Json?               // 額外資訊（時間戳、推薦原因等）
  postId          String?             @map("post_id") @db.Uuid  // 排程後關聯的 Post
  campaignId      String?             @map("campaign_id") @db.Uuid // 關聯的 Email Campaign
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")

  job             RepurposeJob        @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([jobId, type])
  @@map("repurpose_items")
}
```

### 修改現有 Models

**Video** — 新增 relation：
```prisma
model Video {
  // ... existing fields
  repurposeJob  RepurposeJob?
}
```

**Tenant** — 新增 relation：
```prisma
model Tenant {
  // ... existing fields
  repurposeJobs RepurposeJob[]
}
```

**User** — 新增 relation：
```prisma
model User {
  // ... existing fields
  repurposeJobs RepurposeJob[]
}
```

### originalContent JSON 結構

**社群貼文 (SOCIAL_POST):**
```typescript
{
  contentText: string;     // 貼文文案
  hashtags: string[];      // Hashtag 列表
  characterCount: number;  // 字數統計
}
```

**短影片建議 (SHORT_VIDEO_SUGGESTION):**
```typescript
{
  title: string;           // 建議標題
  startTime: number;       // 開始時間（秒）
  endTime: number;         // 結束時間（秒）
  transcriptExcerpt: string; // 對應轉錄文字
  reason: string;          // 推薦原因
  suggestedPlatforms: string[]; // 建議平台
  score: number;           // 推薦分數 0-1
}
```

**Email 通知 (EMAIL):**
```typescript
{
  subject: string;         // 信件主旨
  body: string;            // HTML 正文
  plainText: string;       // 純文字版
  ctaText: string;         // CTA 按鈕文字
  ctaUrl: string;          // CTA 連結（影片連結佔位符）
}
```

---

## API Endpoints

### `GET /api/v1/content-repurpose/video/:videoId`
- **描述**: 取得影片的再利用 job 及所有生成項目
- **認證**: Required
- **Response** `200`:
```typescript
{
  job: {
    id: string;
    videoId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    errorMessage: string | null;
    completedAt: string | null;
    createdAt: string;
    items: RepurposeItemResponse[];
  } | null;
}
```
```typescript
interface RepurposeItemResponse {
  id: string;
  type: 'SOCIAL_POST' | 'SHORT_VIDEO_SUGGESTION' | 'EMAIL';
  status: 'GENERATED' | 'EDITED' | 'SCHEDULED' | 'DISCARDED';
  platform: string | null;
  style: string | null;
  content: object;       // editedContent ?? originalContent
  originalContent: object;
  metadata: object | null;
  postId: string | null;
  campaignId: string | null;
  createdAt: string;
}
```
- **Errors**: `401` Unauthorized, `404` Video not found

### `POST /api/v1/content-repurpose/video/:videoId/generate`
- **描述**: 手動觸發（或重新生成）內容再利用
- **認證**: Required
- **業務規則**: 若已有 COMPLETED 的 job，先刪除舊的 items 再重新生成
- **Response** `201`:
```typescript
{
  jobId: string;
  status: 'PENDING';
  message: string;
}
```
- **Errors**: `400` Video not PROCESSED, `401`, `404`, `409` Job already PROCESSING

### `PATCH /api/v1/content-repurpose/items/:itemId`
- **描述**: 編輯單一再利用項目內容
- **認證**: Required
- **Request Body**:
```typescript
{
  editedContent?: object;  // 編輯後的內容
  status?: 'DISCARDED';    // 標記為棄用
}
```
- **Response** `200`:
```typescript
{
  id: string;
  status: string;
  content: object;
  updatedAt: string;
}
```
- **Errors**: `400` Invalid content, `401`, `404`

### `POST /api/v1/content-repurpose/items/:itemId/reset`
- **描述**: 還原為 AI 原始版本
- **認證**: Required
- **Response** `200`:
```typescript
{
  id: string;
  status: 'GENERATED';
  content: object;  // originalContent
  updatedAt: string;
}
```

### `POST /api/v1/content-repurpose/items/schedule`
- **描述**: 批次排程選中的社群貼文項目
- **認證**: Required
- **Request Body**:
```typescript
{
  itemIds: string[];       // 要排程的 item IDs
  scheduledAt?: string;    // ISO 日期時間，不提供則立即發佈
}
```
- **Response** `201`:
```typescript
{
  scheduled: {
    itemId: string;
    postId: string;
    platform: string;
    status: string;
  }[];
  failed: {
    itemId: string;
    reason: string;
  }[];
}
```
- **Errors**: `400` No items / items not SOCIAL_POST type, `401`

### `POST /api/v1/content-repurpose/items/:itemId/create-campaign`
- **描述**: 將 Email 項目建立為 Email Campaign
- **認證**: Required
- **Request Body**:
```typescript
{
  targetTags?: string[];   // 目標訂閱者標籤，空陣列 = 全部
  scheduledAt?: string;    // 排程時間
}
```
- **Response** `201`:
```typescript
{
  itemId: string;
  campaignId: string;
  status: string;
}
```

### `POST /api/v1/content-repurpose/items/:itemId/generate-short`
- **描述**: 將短影片建議送入 ShortVideo 模組生成
- **認證**: Required
- **Request Body**:
```typescript
{
  format?: '9:16' | '1:1';        // 預設 9:16
  addSubtitles?: boolean;          // 預設 true
  platform?: 'youtube' | 'instagram' | 'tiktok'; // 預設 youtube
}
```
- **Response** `201`:
```typescript
{
  itemId: string;
  shortVideoId: string;
  outputUrl: string;
  platform: string;
}
```

### `POST /api/v1/content-repurpose/items/:itemId/regenerate`
- **描述**: 重新生成單一項目（不影響其他項目）
- **認證**: Required
- **Response** `200`:
```typescript
{
  id: string;
  status: 'GENERATED';
  content: object;
  updatedAt: string;
}
```

---

## Business Logic

### 1. 自動觸發流程

```
Video Pipeline 完成（status → PROCESSED）
       │
       ▼
VideoService.handleDirectUpload() 最後一步
       │ 呼叫
       ▼
ContentRepurposeService.triggerGeneration(videoId, userId, tenantId)
       │
       ▼
建立 RepurposeJob (status: PENDING)
       │
       ▼
BullMQ: content-repurpose queue.add('generate', { jobId })
       │ Worker 處理
       ▼
ContentRepurposeProcessor.process(job)
       │
       ├─→ 並行呼叫 AI:
       │   ├─ generateSocialPosts(transcript, summary, title)     → 15 則貼文
       │   ├─ generateShortVideoSuggestions(transcript, duration)  → 3-5 個片段
       │   └─ generateEmail(summary, title)                        → 1 封通知
       │
       ▼
批次建立 RepurposeItem records
       │
       ▼
更新 RepurposeJob status → COMPLETED
```

### 2. AI Prompt 設計

**社群貼文生成（GPT-4o-mini × 5 次呼叫，每次 3 風格）：**

每個平台一次 API call，回傳 3 種風格。prompt 包含：
- 影片標題、摘要、轉錄稿（截取前 3000 字）
- 平台特性規則（字數限制、風格要求、Hashtag 規則）
- 3 種風格定義和範例

```typescript
// System prompt 範例（Instagram）
const systemPrompt = `你是一位專業的社群媒體文案專家。
根據影片內容，生成 3 種不同風格的 Instagram 貼文。

平台規則：
- 總字數 100-150 字（含 emoji）
- Hashtag 15-30 個，混合大眾標籤和小眾標籤
- 第一行必須是 Hook（引起注意的開頭）
- 結尾要有互動 CTA（提問或邀請留言）

風格要求：
1. knowledge（知識型）：條列重點、實用資訊、乾貨整理
2. story（故事型）：個人經驗切入、引發好奇、情感連結
3. interactive（互動型）：提問開場、投票選項、引發討論

回傳 JSON 格式：
{
  "posts": [
    {
      "style": "knowledge",
      "contentText": "...",
      "hashtags": ["tag1", "tag2", ...]
    },
    ...
  ]
}`;
```

**短影片精華片段分析（GPT-4o × 1 次呼叫）：**

需要更精準的語意理解來判斷精華時刻。

```typescript
const systemPrompt = `你是一位專業的影片剪輯師。
分析以下影片轉錄稿，找出 3-5 個最適合做短影片的精華片段。

選擇標準（按優先級）：
1. 金句/核心觀點 — 獨立成段就有價值的精煉表述
2. 情緒高點 — 激動、驚訝、搞笑的時刻
3. 實用技巧 — 具體可操作的教學步驟
4. 爭議觀點 — 容易引發討論和互動的立場
5. 故事轉折 — 有戲劇性的敘事片段

每個片段：
- 時長 15-60 秒
- 必須是完整的語意段落（不能在句子中間切斷）
- 標注開始/結束的大致時間位置（根據轉錄稿中的順序推估）

影片總時長：{durationSeconds} 秒

回傳 JSON 格式：
{
  "suggestions": [
    {
      "title": "建議短影片標題",
      "startTime": 120,
      "endTime": 155,
      "transcriptExcerpt": "對應的轉錄文字...",
      "reason": "推薦原因",
      "suggestedPlatforms": ["YOUTUBE", "TIKTOK"],
      "score": 0.92
    }
  ]
}`;
```

**Email 生成（GPT-4o-mini × 1 次呼叫）：**

```typescript
const systemPrompt = `你是一位 Email 行銷專家。
為創作者的新影片生成一封會員通知 Email。

要求：
- 主旨：15-30 字，製造好奇心，可包含 emoji
- 正文：HTML 格式，200-300 字
  - 開頭個人化問候
  - 影片核心價值 3 點摘要
  - CTA 按鈕引導觀看
- 提供純文字備份版本

回傳 JSON 格式：
{
  "subject": "...",
  "body": "<html>...</html>",
  "plainText": "...",
  "ctaText": "立即觀看",
  "ctaUrl": "{{VIDEO_URL}}"
}`;
```

### 3. 排程串接流程

```
使用者勾選 items → POST /items/schedule
       │
       ▼
驗證 items 屬於該使用者 & 類型為 SOCIAL_POST
       │
       ▼
對每個 item：
  ├─ 取得 editedContent ?? originalContent
  ├─ 呼叫 PostSchedulerService.create({
  │    userId, tenantId,
  │    contentText: content.contentText,
  │    hashtags: content.hashtags,
  │    platforms: [{ platform: item.platform }],
  │    type: 'ORIGINAL',
  │    aiGenerated: true,
  │    scheduledAt: dto.scheduledAt ?? null
  │  })
  ├─ 更新 item.postId = post.id
  └─ 更新 item.status = 'SCHEDULED'
```

### 4. 邊界條件

- 影片無轉錄稿 → 僅用 title + aiSummary 生成（品質較低，提示使用者）
- 影片時長 < 30 秒 → 不產出短影片建議
- 轉錄稿超過 token 限制 → 截取前 3000 字 + 摘要補充
- 重複觸發 → 檢查 `@@unique([videoId])`，已存在則走重新生成邏輯
- AI 單項生成失敗 → 不影響其他項目，記錄錯誤，允許單項重新生成
- 使用者無已連結社群帳號 → 仍可生成內容，排程時提示需連結帳號

---

## 後端模組結構

```
apps/api/src/modules/content-repurpose/
├── content-repurpose.module.ts
├── content-repurpose.controller.ts
├── content-repurpose.service.ts
├── content-repurpose.processor.ts        # BullMQ Worker
└── dto/
    ├── update-repurpose-item.dto.ts
    ├── schedule-items.dto.ts
    ├── create-campaign.dto.ts
    └── generate-short.dto.ts
```

---

## 前端頁面

### 推廣分頁（影片詳情 Dialog 內新增 Tab）

**路由**: 無新路由，整合在 `app/(dashboard)/videos/page.tsx` 的影片 Dialog 中

**元件結構**:
```
VideoDetailDialog (existing)
├── Tab: 基本資訊 (existing)
├── Tab: 剪輯片段 (existing)
└── Tab: 推廣內容 (NEW) ← RepurposeTab
    ├── RepurposeStatusBanner          # 生成狀態：進行中/完成/失敗
    ├── SubTabs
    │   ├── SocialPostsPanel           # 社群貼文
    │   │   ├── PlatformFilter         # 平台篩選
    │   │   ├── StyleFilter            # 風格篩選
    │   │   ├── PostCard[]             # 貼文卡片（預覽、編輯、勾選）
    │   │   └── BatchScheduleBar       # 底部固定欄：已選 N 則 [排程發佈]
    │   ├── ShortVideoPanel            # 短影片建議
    │   │   └── SuggestionCard[]       # 片段卡片（時間戳、原因、生成按鈕）
    │   └── EmailPanel                 # Email 通知
    │       ├── EmailPreview           # Email 預覽
    │       ├── EmailEditor            # 編輯器
    │       └── SendButton             # 建立 Campaign 按鈕
    └── RegenerateButton               # 重新生成全部
```

**shadcn/ui 元件**:
- Tabs, TabsContent, TabsList, TabsTrigger
- Card, CardContent, CardHeader
- Button, Badge, Checkbox
- Dialog (編輯 modal)
- Textarea (文案編輯)
- Select (平台/風格篩選)
- Alert (狀態提示)
- Skeleton (loading state)

**狀態管理**:
- TanStack Query: `useRepurposeJob(videoId)` — 取得 job + items
- Local state: 勾選的 items、篩選條件
- Mutation: `useUpdateItem`, `useScheduleItems`, `useCreateCampaign`, `useRegenerateItem`

**API 呼叫**:
```typescript
// hooks/use-repurpose.ts
const useRepurposeJob = (videoId: string) =>
  useQuery(['repurpose', videoId], () =>
    api.get(`/content-repurpose/video/${videoId}`)
  );

const useScheduleItems = () =>
  useMutation((data: { itemIds: string[]; scheduledAt?: string }) =>
    api.post('/content-repurpose/items/schedule', data)
  );
```

### 影片列表 Badge

在影片卡片上顯示推廣狀態 badge：
- `PENDING` / `PROCESSING` → 黃色 "生成中..."
- `COMPLETED` → 綠色 "推廣就緒"
- `FAILED` → 紅色 "生成失敗"
- 無 job → 不顯示

---

## 測試案例

### Happy Path
- [ ] 影片 PROCESSED 後自動建立 RepurposeJob (status: PENDING) 並排入 BullMQ
- [ ] Worker 處理 job 後產出 15 則社群貼文（5 平台 × 3 風格）
- [ ] Worker 處理 job 後產出 3-5 個短影片建議（含時間戳和原因）
- [ ] Worker 處理 job 後產出 1 封 Email（含 subject + HTML body）
- [ ] 手動觸發 POST /generate 可重新生成所有內容
- [ ] PATCH /items/:id 可更新 editedContent，status 變為 EDITED
- [ ] POST /items/:id/reset 清除 editedContent，status 還原 GENERATED
- [ ] POST /items/schedule 批次建立 Post 並更新 item status 為 SCHEDULED
- [ ] POST /items/:id/create-campaign 建立 EmailCampaign
- [ ] POST /items/:id/generate-short 呼叫 ShortVideoService 生成短影片

### Edge Cases
- [ ] 影片無轉錄稿 → 用 title + aiSummary 生成，品質標記降低
- [ ] 影片時長 < 30 秒 → 不產出短影片建議，其餘正常
- [ ] 轉錄稿超長 → 截取前 3000 字 + 摘要
- [ ] 重複觸發生成 → 刪除舊 items，重新生成
- [ ] AI 部分失敗（如 Email 生成失敗）→ 其餘項目正常儲存，job 仍標記 COMPLETED，失敗項不建立
- [ ] 單項重新生成 → 僅更新該 item 的 originalContent 和 editedContent（清空）
- [ ] 排程已 DISCARDED 的 item → 返回 400 錯誤
- [ ] 排程無連結帳號的平台 → 返回 warning 但仍建立 DRAFT post

### Security
- [ ] 只能存取自己 tenant 的 repurpose job 和 items
- [ ] item 的 ownership 驗證（透過 job → video → userId）
- [ ] API 輸入驗證（class-validator）
- [ ] 不可對 PROCESSING 中的 job 觸發重新生成

### PRD 驗收條件對應

| PRD AC | 對應 API / 流程 |
|--------|----------------|
| Story1-AC1 | VideoService → triggerGeneration → BullMQ enqueue |
| Story1-AC2 | ContentRepurposeProcessor → generateSocialPosts → 15 items |
| Story1-AC3 | ContentRepurposeProcessor → generateShortVideoSuggestions → 3-5 items |
| Story1-AC4 | ContentRepurposeProcessor → generateEmail → 1 item |
| Story2-AC1 | GET /video/:videoId → items grouped by type |
| Story2-AC2 | PATCH /items/:id → editedContent |
| Story2-AC3 | PATCH (save edited) + POST /reset (restore original) |
| Story3-AC1 | POST /items/schedule → create Posts via PostSchedulerService |
| Story3-AC2 | POST /items/:id/create-campaign → EmailMarketingService |
| Story3-AC3 | POST /items/schedule → scheduledAt parameter |
| Story4-AC1 | SHORT_VIDEO_SUGGESTION items with startTime, endTime, reason, suggestedPlatforms |
| Story4-AC2 | POST /items/:id/generate-short → ShortVideoService.generateShort() |
| Story4-AC3 | SHORT_VIDEO_SUGGESTION originalContent.transcriptExcerpt |
| Story5-AC1 | GET /video/:videoId → job.status === 'PROCESSING' |
| Story5-AC2 | GET /video/:videoId → job.status === 'COMPLETED' |
| Story5-AC3 | GET /video/:videoId → job.status === 'FAILED' + POST /generate |
