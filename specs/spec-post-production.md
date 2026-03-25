# AI 後製加速工具 — 技術規格文檔

> Phase: 4 | Priority: P0 | Status: draft
> PRD: specs/prd-post-production.md

## 概述

升級 Whisper 轉錄為 word-level timestamps，並基於此構建 5 個後製加速功能：去語助詞、章節標記、精華片段升級、多平台適配、腳本摘要。所有功能整合在影片詳情 Dialog 的新「後製工具」Tab 中。

## 依賴關係

- **前置模組**: Video（影片處理 pipeline）、AI（OpenAI 封裝）、ShortVideo（短影片生成）
- **使用的共用元件**: JwtAuthGuard, PrismaService, @CurrentUser()
- **外部服務**: OpenAI (Whisper verbose_json, GPT-4o-mini)
- **工具**: FFmpeg（裁切、拼接、crossfade）

## Database Models

### 修改現有 Model: Video

在 `metadata` JSON 欄位中新增 `whisperWords` key，不需修改 Prisma schema：
```typescript
// Video.metadata 結構擴展
{
  whisperWords?: WhisperWord[];  // word-level timestamps
  fillerMarks?: FillerMark[];    // 語助詞標記結果
  chapters?: Chapter[];          // 章節標記結果
  scriptSummary?: ScriptSummary; // 腳本摘要結果
}
```

### 資料結構定義（存入 Video.metadata JSON）

```typescript
interface WhisperWord {
  word: string;
  start: number;  // 秒
  end: number;    // 秒
}

interface FillerMark {
  id: string;          // uuid
  word: string;
  startTime: number;
  endTime: number;
  contextBefore: string;
  contextAfter: string;
}

interface Chapter {
  id: string;
  title: string;
  startTime: number;   // 秒
}

interface ScriptSummary {
  title: string;
  totalDuration: string;
  sections: Array<{
    title: string;
    timeRange: string;
    startTime: number;
    endTime: number;
    keyPoints: string[];
    keywords: string[];
  }>;
  tags: string[];
  oneLinerSummary: string;
}
```

**設計決策**: 使用 Video.metadata JSON 欄位而非新增獨立 table，因為：
- 這些資料與影片 1:1 關聯
- 結構簡單，無需 relational query
- 避免增加 migration 成本

---

## API Endpoints

### `POST /api/v1/videos/:videoId/transcribe-words`
- **描述**: 取得 Whisper word-level timestamps 並存入 metadata
- **認證**: Required
- **Response** `200`:
```typescript
{
  videoId: string;
  wordCount: number;
  durationSeconds: number;
  message: string;
}
```
- **業務邏輯**:
  1. 檢查影片 ownership + PROCESSED 狀態
  2. 提取音訊 → Whisper verbose_json
  3. 存入 `metadata.whisperWords`
- **Errors**: `400` not PROCESSED, `404` video not found, `409` already has whisperWords

### `POST /api/v1/videos/:videoId/detect-fillers`
- **描述**: 偵測語助詞並回傳標記列表
- **認證**: Required
- **Response** `200`:
```typescript
{
  videoId: string;
  fillers: FillerMark[];
  totalCount: number;
  estimatedSavings: number;  // 預估可省秒數
}
```
- **業務邏輯**:
  1. 讀取 `metadata.whisperWords`（無則先呼叫 transcribe-words）
  2. 匹配預定義語助詞列表
  3. 計算前後語境
  4. 存入 `metadata.fillerMarks`

### `POST /api/v1/videos/:videoId/cut-fillers`
- **描述**: 根據選中的語助詞標記產出裁切版影片
- **認證**: Required
- **Request Body**:
```typescript
{
  fillerIds: string[];  // 要移除的 filler mark IDs
}
```
- **Response** `201`:
```typescript
{
  videoId: string;
  outputUrl: string;        // 裁切後影片路徑
  originalDuration: number;
  newDuration: number;
  removedCount: number;
}
```
- **業務邏輯**:
  1. 從 `metadata.fillerMarks` 取出選中的標記
  2. 計算保留區間（反轉移除區間）
  3. FFmpeg concat filter 拼接保留區間（加 10ms crossfade）
  4. 輸出到 `/uploads/videos/{videoId}-trimmed.mp4`

### `POST /api/v1/videos/:videoId/generate-chapters`
- **描述**: AI 生成 YouTube 章節標記
- **認證**: Required
- **Response** `200`:
```typescript
{
  videoId: string;
  chapters: Chapter[];
  youtubeFormat: string;  // 可直接複製的 YouTube 格式文字
}
```

### `PATCH /api/v1/videos/:videoId/chapters`
- **描述**: 編輯章節標記
- **認證**: Required
- **Request Body**:
```typescript
{
  chapters: Array<{
    id: string;
    title: string;
    startTime: number;
  }>;
}
```
- **Response** `200`:
```typescript
{
  chapters: Chapter[];
  youtubeFormat: string;
}
```

### `POST /api/v1/videos/:videoId/generate-script-summary`
- **描述**: AI 生成影片腳本摘要
- **認證**: Required
- **Response** `200`:
```typescript
{
  videoId: string;
  summary: ScriptSummary;
  markdown: string;  // Markdown 格式輸出
}
```

### `POST /api/v1/short-videos/multi-platform`
- **描述**: 一鍵多平台適配（批次生成）
- **認證**: Required
- **Request Body**:
```typescript
{
  videoId: string;
  clipId: string;
  platforms: Array<'youtube_shorts' | 'instagram_reels' | 'tiktok' | 'instagram_square'>;
  addSubtitles?: boolean;  // 預設 true
}
```
- **Response** `201`:
```typescript
{
  results: Array<{
    platform: string;
    outputUrl: string;
    thumbnailUrl: string;
    title: string;
    caption: string;
    hashtags: string[];
    format: '9:16' | '1:1';
    durationSeconds: number;
  }>;
  failed: Array<{
    platform: string;
    reason: string;
  }>;
}
```

---

## Business Logic

### 1. Whisper Word-Level Transcription

```
影片檔案
  │
  ▼ FFmpeg 提取音訊（16kHz mono MP3）
  │
  ▼ OpenAI Whisper API
  │  model: whisper-1
  │  response_format: verbose_json
  │  timestamp_granularities: [word]
  │  language: zh
  │
  ▼ 回傳 WhisperWord[]
  │  { word: "今天", start: 0.0, end: 0.32 }
  │  { word: "我們", start: 0.32, end: 0.56 }
  │  ...
  │
  ▼ 存入 Video.metadata.whisperWords
```

**AiService 升級**: 新增 `transcribeVerbose()` 方法：
```typescript
async transcribeVerbose(
  filePath: string,
  options?: { language?: string },
): Promise<{ text: string; words: WhisperWord[] }>
```

### 2. 語助詞偵測邏輯

```typescript
const FILLER_WORDS = new Set([
  '嗯', '啊', '呃', '那個', '就是', '然後', '對', '對對對',
  '基本上', '所以說', '怎麼說', '其實', '反正', '就是說',
  '你知道', '我覺得就是', '應該是',
]);

function detectFillers(words: WhisperWord[]): FillerMark[] {
  return words
    .filter(w => FILLER_WORDS.has(w.word.trim()))
    .map((w, idx) => ({
      id: uuid(),
      word: w.word,
      startTime: w.start,
      endTime: w.end,
      contextBefore: words.slice(Math.max(0, idx - 5), idx).map(x => x.word).join(''),
      contextAfter: words.slice(idx + 1, idx + 6).map(x => x.word).join(''),
    }));
}
```

### 3. FFmpeg 裁切拼接邏輯

```
原始影片: [0s ──────────────────────── 600s]

選中移除: [15.2-15.8] [42.1-42.5] [180.3-181.0]

保留區間: [0-15.2] [15.8-42.1] [42.5-180.3] [181.0-600]

FFmpeg concat:
  - 提取每個保留區間為臨時檔案
  - 使用 concat demuxer 拼接
  - 加 10ms audio crossfade 避免爆音
  - 輸出 {videoId}-trimmed.mp4
```

### 4. 章節標記 AI Prompt

```typescript
const systemPrompt = `你是影片內容結構分析專家。
根據影片轉錄稿，識別主題轉換點並產出 YouTube 章節標記。

規則：
- 第一個章節必須是 00:00
- 每個章節標題 5-15 字，精確描述該段內容
- 章節間隔至少 60 秒
- 通常一支 10 分鐘影片有 5-8 個章節
- 使用繁體中文

回傳 JSON：
{
  "chapters": [
    { "title": "開場介紹", "startTime": 0 },
    { "title": "第一個重點", "startTime": 135 },
    ...
  ]
}`;
```

### 5. 精華片段升級

**修改 VideoService.generateAiClips():**

變更前：AI 回傳 `startPct` / `endPct`（0-1 比例），再乘以 duration 計算時間
變更後：
- 如果有 `metadata.whisperWords`，將 word timestamps 作為參考傳給 GPT
- AI 直接回傳精準的 `startTime` / `endTime`（秒）
- 向下相容：無 whisperWords 時退回 startPct/endPct 邏輯

```typescript
// 新的 AI 回傳格式（有 whisperWords 時）
interface PreciseClipDef {
  title: string;
  startTime: number;   // 精準秒數
  endTime: number;
  score: number;
  hashtags: string[];
  reason: string;      // 新增：推薦原因
}
```

### 6. 多平台適配邏輯

```
選中片段 (clipId)
  │
  ▼ 並行處理每個勾選的平台：
  │
  ├─ YouTube Shorts (9:16)
  │  └─ cutAndResize → generateSubtitles → burnSubtitles → generateCaption
  │
  ├─ Instagram Reels (9:16)
  │  └─ cutAndResize → generateSubtitles → burnSubtitles → generateCaption
  │
  ├─ TikTok (9:16)
  │  └─ cutAndResize → generateSubtitles → burnSubtitles → generateCaption
  │
  └─ IG 正方形 (1:1)
     └─ cutAndResize → generateSubtitles → burnSubtitles → generateCaption
```

**ShortVideoService 新增方法:**
```typescript
async generateMultiPlatform(
  videoId: string,
  clipId: string,
  userId: string,
  platforms: string[],
  options?: { addSubtitles?: boolean },
): Promise<{ results: ShortVideoResult[]; failed: Array<{ platform: string; reason: string }> }>
```

### 7. 腳本摘要 AI Prompt

```typescript
const systemPrompt = `你是內容分析專家。分析影片轉錄稿，產出結構化腳本大綱。

要求：
- 將影片拆解為 Intro + 3-7 個主要段落 + 結尾
- 每段包含：標題、時間範圍、2-3 個核心論點、關鍵字
- 產出一句話摘要
- 使用繁體中文

回傳 JSON：
{
  "title": "影片主題",
  "totalDuration": "12:30",
  "sections": [...],
  "tags": ["tag1", "tag2"],
  "oneLinerSummary": "一句話描述"
}`;
```

### 邊界條件

- 影片無轉錄稿 → 先自動轉錄再執行功能
- 影片 < 30 秒 → 不提供章節標記和腳本摘要（太短無意義）
- 影片 > 60 分鐘 → word-level 資料截取前 60 分鐘
- FFmpeg 裁切失敗 → 回傳錯誤但不影響原始影片
- Whisper word-level 斷詞不準 → 語助詞匹配改用 includes 模糊匹配
- 多平台 batch → 限制並發 2（避免 FFmpeg 吃滿 CPU）

---

## 後端模組結構

不新增獨立模組，擴展現有模組：

```
apps/api/src/modules/
├── ai/
│   └── ai.service.ts              # 新增 transcribeVerbose()
├── video/
│   ├── video.controller.ts        # 新增 5 支 API endpoints
│   ├── video.service.ts           # 新增 detectFillers, cutFillers, generateChapters,
│   │                              #      generateScriptSummary, 升級 generateAiClips
│   └── dto/
│       ├── cut-fillers.dto.ts     # NEW
│       └── update-chapters.dto.ts # NEW
└── short-video/
    ├── short-video.controller.ts  # 新增 multi-platform endpoint
    ├── short-video.service.ts     # 新增 generateMultiPlatform()
    └── dto/
        └── multi-platform.dto.ts  # NEW
```

---

## 前端頁面

### 後製工具面板（影片詳情 Dialog 內新增 Tab）

**路由**: 無新路由，整合在影片 Dialog

**元件結構**:
```
VideoDetailDialog (existing)
├── Tab: 基本資訊 (existing)
├── Tab: AI 剪輯片段 (existing, 升級)
├── Tab: 推廣內容 (existing)
└── Tab: 後製工具 (NEW) ← PostProductionTab
    ├── FillerRemovalPanel
    │   ├── [偵測語助詞] 按鈕
    │   ├── FillerMarkList（勾選框 + 時間 + 語境）
    │   ├── StatsBar（偵測 X 個 / 已選 Y 個 / 省 Z 秒）
    │   └── [產出裁切版] 按鈕 + 結果
    ├── ChapterPanel
    │   ├── [生成章節] 按鈕
    │   ├── ChapterList（可編輯標題 + 時間）
    │   └── [複製 YouTube 格式] 按鈕
    ├── ScriptSummaryPanel
    │   ├── [生成摘要] 按鈕
    │   ├── SectionCards（段落 + 論點 + 時間）
    │   └── [複製] [匯出 MD] 按鈕
    └── MultiPlatformPanel
        ├── ClipSelector（從現有 clips 選）
        ├── PlatformCheckboxes
        ├── [生成全部] 按鈕
        └── ResultCards（縮圖 + 下載 + 排程）
```

**新增 hooks**:
```typescript
// hooks/use-post-production.ts
useTranscribeWords(videoId)      // POST transcribe-words
useDetectFillers(videoId)        // POST detect-fillers
useCutFillers()                  // POST cut-fillers
useGenerateChapters(videoId)     // POST generate-chapters
useUpdateChapters()              // PATCH chapters
useGenerateScriptSummary(videoId) // POST generate-script-summary
useMultiPlatform()               // POST multi-platform
```

---

## 測試案例

### Happy Path
- [ ] Whisper verbose_json 回傳 word-level timestamps 並存入 metadata
- [ ] 偵測語助詞回傳正確的 FillerMark 列表
- [ ] FFmpeg 裁切拼接產出正確時長的新影片
- [ ] AI 章節標記產出 YouTube 格式文字（00:00 開頭）
- [ ] 章節編輯後儲存正確
- [ ] 精華片段使用 word-level 時間戳精準定位
- [ ] 多平台 batch 產出 4 個格式的短影片
- [ ] 腳本摘要產出結構化 JSON + Markdown

### Edge Cases
- [ ] 影片無音訊 → 語助詞偵測回傳空列表
- [ ] 影片 < 30 秒 → 章節和腳本摘要不可用
- [ ] 無 word-level 資料 → 精華片段退回比例推估
- [ ] FFmpeg 裁切失敗 → 錯誤回傳，原始影片不受影響
- [ ] 連續語助詞（嗯嗯嗯）→ 合併為單一標記
- [ ] 多平台 batch 部分失敗 → 回傳成功 + 失敗列表

### Security
- [ ] 所有 endpoint 需 JWT 認證
- [ ] 影片 ownership 檢查
- [ ] 裁切檔案存於獨立路徑，不覆蓋原始檔案

### PRD 驗收條件對應

| PRD AC | 對應 API / 流程 |
|--------|----------------|
| Story1-AC1 | POST /transcribe-words → POST /detect-fillers |
| Story1-AC2 | detect-fillers response 包含 contextBefore/contextAfter |
| Story1-AC3 | POST /cut-fillers → FFmpeg concat |
| Story1-AC4 | cut-fillers response 包含 originalDuration / newDuration |
| Story2-AC1 | POST /generate-chapters |
| Story2-AC2 | chapters response 列表 |
| Story2-AC3 | PATCH /chapters |
| Story2-AC4 | chapters response 包含 youtubeFormat |
| Story3-AC1 | 升級 generateAiClips + whisperWords |
| Story3-AC2 | clip 回傳包含 reason 欄位 |
| Story3-AC3 | 前端 UI（微調起止時間 + 預覽文字） |
| Story4-AC1 | POST /multi-platform request body platforms[] |
| Story4-AC2 | generateMultiPlatform 並行處理 |
| Story4-AC3 | multi-platform response results[] |
| Story4-AC4 | 前端「全部排程」→ 呼叫 PostScheduler |
| Story5-AC1 | POST /generate-script-summary |
| Story5-AC2 | ScriptSummary 結構 |
| Story5-AC3 | response 包含 markdown 欄位 |
