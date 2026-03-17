# Video Upload + AI Clipping — 規格文檔

> Phase: 1 | Priority: P0 | Status: draft

## 概述
影片上傳與 AI 自動剪輯模組是平台核心功能。創作者上傳長影片後，系統透過 AI 自動辨識精華片段、生成短影片 clips，並附帶標題、描述與 hashtags，大幅降低創作者的剪輯時間成本。

## 依賴關係
- **前置模組**: Auth (1.1)、Database Setup (1.2)、User System (1.3)
- **使用的共用元件**: `JwtAuthGuard`, `TenantInterceptor`, `PrismaService`, `S3Service`, `BullMQ Queue`
- **外部服務**: AWS S3 + CloudFront (存儲/CDN)、OpenAI Whisper API (語音轉文字)、OpenAI GPT-4o (內容分析)、FFmpeg (影片處理)

## 相關檔案
```
apps/api/src/modules/video/
├── video.module.ts
├── video.controller.ts
├── video.service.ts
├── video.gateway.ts              # WebSocket 即時進度
├── dto/
│   ├── request-upload-url.dto.ts
│   ├── update-clip.dto.ts
│   └── list-videos-query.dto.ts
├── entities/
│   └── video.entity.ts
└── __tests__/
    ├── video.controller.spec.ts
    └── video.service.spec.ts

apps/api/src/workers/
├── video-processing.worker.ts    # BullMQ worker 主流程
├── video-processing.processor.ts # 各步驟 processor
└── __tests__/
    └── video-processing.worker.spec.ts
```

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `Video`, `VideoClip`
相關 Enums: `VideoStatus`, `ClipStatus`

### Video
```prisma
enum VideoStatus {
  UPLOADING
  UPLOADED
  PROCESSING
  PROCESSED
  FAILED
}

model Video {
  id              String       @id @default(cuid())
  userId          String
  tenantId        String
  title           String
  description     String?      @db.Text
  originalUrl     String       // S3 URL of original video
  durationSeconds Int?
  fileSizeBytes   BigInt
  mimeType        String       // e.g. "video/mp4"
  status          VideoStatus  @default(UPLOADING)
  transcript      String?      @db.Text
  aiSummary       String?      @db.Text
  thumbnailUrl    String?
  metadata        Json?        // FFprobe output: codec, resolution, fps, bitrate
  errorMessage    String?      // 失敗時記錄原因
  retryCount      Int          @default(0)

  clips           VideoClip[]
  user            User         @relation(fields: [userId], references: [id])

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@index([tenantId])
  @@index([userId])
  @@index([status])
  @@map("videos")
}
```

### VideoClip
```prisma
enum ClipStatus {
  GENERATING
  READY
  PUBLISHED
  ARCHIVED
}

model VideoClip {
  id              String      @id @default(cuid())
  videoId         String
  tenantId        String
  title           String
  description     String?     @db.Text
  startTime       Float       // seconds from video start
  endTime         Float       // seconds from video start
  clipUrl         String?     // S3 URL, null while GENERATING
  thumbnailUrl    String?
  durationSeconds Float
  aiScore         Float       // 0.0 ~ 1.0, AI 判斷的精彩程度
  hashtags        String[]    // AI 生成的 hashtags
  status          ClipStatus  @default(GENERATING)
  aspectRatios    Json?       // { "9:16": "s3://...", "1:1": "s3://...", "16:9": "s3://..." }
  metadata        Json?       // AI 分析原因、關鍵字等

  video           Video       @relation(fields: [videoId], references: [id], onDelete: Cascade)

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([tenantId])
  @@index([videoId])
  @@index([aiScore(sort: Desc)])
  @@map("video_clips")
}
```

## API Endpoints

### `POST /api/v1/videos/upload-url`
- **描述**: 取得 S3 presigned upload URL，前端直傳 S3
- **認證**: Required
- **Request Body**:
```typescript
{
  filename: string;     // "my-vlog-2024.mp4"
  contentType: string;  // "video/mp4"
  fileSize: number;     // bytes, max 5GB
}
```
- **Response** `201`:
```typescript
{
  uploadUrl: string;    // S3 presigned PUT URL (expires 1hr)
  videoId: string;      // 預先建立的 Video record ID
  fields?: Record<string, string>; // presigned POST fields (if using POST)
}
```
- **Errors**: `400` invalid file type or size / `401` unauthorized
- **Validation**:
  - `contentType` 限制: `video/mp4`, `video/quicktime`, `video/webm`, `video/x-msvideo`
  - `fileSize` 上限: 5GB (Free plan: 500MB)
  - `filename` 長度上限: 255 chars

### `POST /api/v1/videos/:id/uploaded`
- **描述**: 前端上傳完成後呼叫，觸發影片處理流程
- **認證**: Required (must be video owner)
- **Request Body**: none
- **Response** `200`:
```typescript
{
  id: string;
  status: "PROCESSING";
  message: "Video processing started";
}
```
- **Errors**: `404` video not found / `409` video status not UPLOADING
- **Side Effects**: enqueue `video-processing` BullMQ job

### `GET /api/v1/videos`
- **描述**: 取得影片列表 (cursor-based pagination)
- **認證**: Required
- **Query Parameters**:
```typescript
{
  cursor?: string;              // pagination cursor (video ID)
  limit?: number;               // default 20, max 50
  status?: VideoStatus;         // filter by status
  search?: string;              // 搜尋 title / description
  sortBy?: "createdAt" | "durationSeconds"; // default "createdAt"
  sortOrder?: "asc" | "desc";   // default "desc"
}
```
- **Response** `200`:
```typescript
{
  data: Video[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

### `GET /api/v1/videos/:id`
- **描述**: 取得影片詳情 (含 clips)
- **認證**: Required (must be video owner)
- **Response** `200`:
```typescript
{
  ...Video;
  clips: VideoClip[];    // ordered by startTime
  processingProgress?: { // only when status === PROCESSING
    stage: string;       // "extracting_audio" | "transcribing" | "analyzing" | "clipping" | "generating_thumbnails"
    percent: number;     // 0-100
  };
}
```
- **Errors**: `404` video not found

### `DELETE /api/v1/videos/:id`
- **描述**: 刪除影片與所有相關 clips (soft delete 或 hard delete + S3 cleanup)
- **認證**: Required (must be video owner)
- **Response** `204`: no content
- **Errors**: `404` video not found
- **Side Effects**:
  - 取消進行中的 BullMQ job (if any)
  - 排程 S3 檔案清理 (original video + all clips + thumbnails)

### `GET /api/v1/videos/:id/clips`
- **描述**: 取得特定影片的所有 clips
- **認證**: Required (must be video owner)
- **Query Parameters**:
```typescript
{
  status?: ClipStatus;
  sortBy?: "aiScore" | "startTime" | "createdAt";  // default "aiScore"
  sortOrder?: "asc" | "desc";                       // default "desc"
}
```
- **Response** `200`:
```typescript
{
  data: VideoClip[];
  total: number;
}
```

### `PATCH /api/v1/videos/:id/clips/:clipId`
- **描述**: 更新 clip 標題/描述/hashtags
- **認證**: Required (must be video owner)
- **Request Body**:
```typescript
{
  title?: string;       // max 200 chars
  description?: string; // max 2000 chars
  hashtags?: string[];  // max 30 items
}
```
- **Response** `200`: updated `VideoClip`
- **Errors**: `404` clip not found / `400` validation error

### `POST /api/v1/videos/:id/clips/:clipId/schedule`
- **描述**: 從 clip 建立排程貼文 (連結至 post-scheduler module)
- **認證**: Required
- **Request Body**:
```typescript
{
  platforms: ("YOUTUBE" | "INSTAGRAM" | "TIKTOK")[];
  scheduledAt: string;     // ISO 8601 datetime
  aspectRatio: "9:16" | "1:1" | "16:9";
  customTitle?: string;
  customDescription?: string;
}
```
- **Response** `201`:
```typescript
{
  postId: string;
  scheduledAt: string;
  platforms: string[];
}
```
- **Errors**: `404` clip not found / `400` clip status not READY / `400` no connected social accounts

## Business Logic

### 影片上傳流程
1. 前端呼叫 `POST /upload-url`，後端建立 `Video` record (status: `UPLOADING`)，回傳 S3 presigned URL
2. 前端使用 presigned URL 直接上傳至 S3 (multipart upload for large files)
3. 上傳完成後，前端呼叫 `POST /:id/uploaded`
4. 後端驗證 S3 物件存在 (HeadObject)，更新 status 為 `UPLOADED`
5. 後端將 job 加入 `video-processing` BullMQ queue

**邊界條件**:
- 上傳中斷 → presigned URL 1hr 過期後，scheduled cleanup job 清理孤立 records
- 重複呼叫 `/uploaded` → 409 Conflict (idempotency)
- S3 物件不存在 → 400 error，status 保持 `UPLOADING`

### Video Processing Worker Pipeline
BullMQ worker 處理 `video-processing` queue，每個 job 依序執行以下步驟:

```
Job Payload: { videoId: string, tenantId: string, userId: string }
```

#### Step 1: Extract Audio (FFmpeg)
- 從 S3 下載 original video 至 temp directory
- `ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav`
- 產出: WAV 音訊檔 (16kHz mono, Whisper 最佳格式)
- Progress: 0% → 15%

#### Step 2: Transcription (OpenAI Whisper API)
- 將 WAV 檔上傳至 Whisper API (`model: "whisper-1"`)
- 使用 `response_format: "verbose_json"` 取得 word-level timestamps
- 儲存完整 transcript 至 `Video.transcript`
- 若音訊 > 25MB，切割成 chunks 後分段處理再合併
- Progress: 15% → 40%

#### Step 3: AI Analysis (GPT-4o)
- 將 transcript + timestamps 送至 GPT-4o
- System prompt 指示 AI 分析:
  - 辨識 3-8 個精華片段 (highlight segments)
  - 每個片段提供: `startTime`, `endTime`, `reason`, `score` (0-1), `suggestedTitle`
  - 考慮因素: 情感高點、笑點、知識密度、衝突/轉折、viral potential
- 限制單一 clip 長度: 15s ~ 90s
- 建立 `VideoClip` records (status: `GENERATING`)
- 儲存 AI summary 至 `Video.aiSummary`
- Progress: 40% → 55%

#### Step 4: Clip Video (FFmpeg)
- 根據 AI 分析結果，使用 FFmpeg 切割影片
- 每個 clip 使用 keyframe-accurate cutting:
  ```
  ffmpeg -ss {startTime} -i input.mp4 -t {duration} -c:v libx264 -c:a aac -movflags +faststart output.mp4
  ```
- 上傳 clip 至 S3 (`videos/{tenantId}/{videoId}/clips/{clipId}/original.mp4`)
- Progress: 55% → 75%

#### Step 5: Generate Aspect Ratios (FFmpeg)
- 為每個 clip 生成三種比例:
  - **9:16** (Shorts/Reels/TikTok): `1080x1920` — 智慧裁切 (偵測人臉/主體)
  - **1:1** (Instagram Feed): `1080x1080` — 居中裁切
  - **16:9** (YouTube): `1920x1080` — 原始或 letterbox
- 上傳至 S3，更新 `VideoClip.aspectRatios` JSON
- Progress: 75% → 90%

#### Step 6: Generate Thumbnails
- 從每個 clip 擷取最佳幀作為 thumbnail
  ```
  ffmpeg -ss {bestFrame} -i clip.mp4 -frames:v 1 -q:v 2 thumb.jpg
  ```
- 生成多種尺寸: 1280x720, 640x360, 320x180
- 上傳至 S3，更新 `VideoClip.thumbnailUrl`
- Progress: 90% → 95%

#### Step 7: AI Generate Metadata
- GPT-4o 為每個 clip 生成:
  - `title`: 適合各平台的標題 (max 100 chars)
  - `description`: 包含 call-to-action 的描述 (max 500 chars)
  - `hashtags`: 5-15 個相關 hashtags
- 更新所有 `VideoClip` records，status 改為 `READY`
- 更新 `Video.status` 為 `PROCESSED`
- Progress: 95% → 100%

### Worker Error Handling & Retry
```typescript
// BullMQ job options
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 30000,  // 30s, 60s, 120s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
}
```

- 每個步驟獨立 try-catch，失敗時記錄具體 step + error message
- Whisper API rate limit → 自動 retry with backoff
- FFmpeg crash → 記錄 stderr output，標記 video 為 `FAILED`
- 所有 retry 耗盡後: `Video.status` → `FAILED`，`Video.errorMessage` 記錄原因
- Temp 檔案無論成功失敗都必須清理 (finally block)

### 即時進度通知 (WebSocket)
```typescript
// VideoGateway (WebSocket)
@WebSocketGateway({ namespace: '/video' })
export class VideoGateway {
  // Client subscribes: socket.emit('subscribe', { videoId })
  // Server pushes: socket.emit('processing-progress', { videoId, stage, percent })
  // Final: socket.emit('processing-complete', { videoId, clipCount })
  // Error: socket.emit('processing-failed', { videoId, error })
}
```

- Client 透過 `videoId` subscribe 特定影片的處理進度
- Worker 透過 Redis pub/sub 發送進度更新
- Gateway 接收後推送至對應 client
- 斷線重連時自動 re-subscribe

## 前端頁面

### 影片列表頁 (`app/(dashboard)/videos/page.tsx`)
- **功能**: 顯示所有影片，支援狀態篩選與搜尋
- **元件**:
  - `DataTable` (shadcn/ui) — 影片列表表格
  - `Badge` — status 標籤 (UPLOADING=yellow, PROCESSING=blue+spinner, PROCESSED=green, FAILED=red)
  - `Input` — 搜尋欄
  - `Select` — 狀態篩選 dropdown
  - `Button` — "Upload Video" CTA
  - `DropdownMenu` — 每列操作 (view, delete)
  - `AlertDialog` — 刪除確認
- **狀態管理**: SWR (`useSWR('/api/v1/videos')`)，auto-revalidate 30s
- **Infinite scroll**: `useSWRInfinite` + `IntersectionObserver`

### 影片上傳頁 (`app/(dashboard)/videos/upload/page.tsx`)
- **功能**: 拖放上傳影片，顯示上傳進度
- **元件**:
  - Drag & Drop zone (react-dropzone)
  - `Progress` bar (shadcn/ui) — 上傳百分比
  - File info preview (name, size, type)
  - `Button` — cancel upload
- **狀態管理**: local state (`useState`)
- **上傳流程**:
  1. 選擇/拖放檔案 → 驗證格式與大小
  2. `POST /upload-url` 取得 presigned URL
  3. `XMLHttpRequest` (支援 progress event) 上傳至 S3
  4. 上傳完成 → `POST /:id/uploaded`
  5. 導向 video detail page (processing 狀態)
- **Multipart Upload**: 檔案 > 100MB 時使用 S3 multipart upload (5MB chunks)

### 影片詳情頁 (`app/(dashboard)/videos/[id]/page.tsx`)
- **功能**: 檢視影片詳情、AI 生成的 clips、編輯 clip 資訊
- **元件**:
  - Video player (react-player) — 原始影片播放
  - Timeline scrubber — 標示 clip 位置
  - Clip cards grid — 每個 clip 的預覽、分數、操作
  - `Tabs` — "Clips" / "Transcript" / "Summary"
  - `Dialog` — clip 編輯 (title, description, hashtags)
  - `Badge` — clip status + AI score
  - `Button` — "Schedule Post" per clip
  - Processing progress indicator (連接 WebSocket)
  - `Skeleton` loading states
- **狀態管理**: SWR + WebSocket (`useWebSocket` hook)
- **即時更新**: 處理中時 WebSocket 顯示各步驟進度，完成後自動 revalidate clips

## 測試案例

### Happy Path
- [ ] Upload flow: 取得 presigned URL → 確認回傳 `uploadUrl` 與 `videoId`
- [ ] Upload callback: `POST /:id/uploaded` → status 變為 `PROCESSING`，BullMQ job created
- [ ] Processing pipeline: 完整流程 → Video status 變為 `PROCESSED`，clips 生成正確
- [ ] List videos: pagination + status filter 正確回傳
- [ ] Get video detail: 回傳 video + clips，clips 按 startTime 排序
- [ ] Update clip: PATCH 更新 title/description → 回傳更新後資料
- [ ] Delete video: 刪除 video + clips + S3 檔案

### Edge Cases
- [ ] 上傳超大檔案 (5GB) → multipart upload 正確處理
- [ ] 上傳不支援的格式 (e.g., `.avi` 非白名單) → 400 error
- [ ] Free plan 使用者上傳 > 500MB → 400 error with plan upgrade message
- [ ] 無語音的影片 → Whisper 回傳空 transcript，AI 改用視覺分析
- [ ] 極短影片 (< 30s) → AI 判斷不切割，回傳 0 clips + 提示
- [ ] 極長影片 (> 4hr) → Whisper chunked processing 正確合併
- [ ] 處理中途 worker crash → retry 從失敗步驟繼續
- [ ] 重複呼叫 `/uploaded` → 409 Conflict (idempotency)
- [ ] 並發上傳多部影片 → queue 依序處理，互不影響

### Security
- [ ] 非 owner 無法存取/刪除他人影片 (tenant isolation)
- [ ] Presigned URL 過期後無法上傳 (1hr TTL)
- [ ] 上傳大小限制在 presigned URL policy 中強制執行
- [ ] API rate limiting: upload-url 每分鐘 10 次
- [ ] S3 bucket 設定: no public access, CloudFront signed URLs for playback
- [ ] FFmpeg 輸入驗證防止 command injection
- [ ] Temp 檔案不包含 tenantId/userId 以外的路徑穿越
