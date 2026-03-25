# AI 後製加速工具 — 產品需求文檔 (PRD)

> Status: draft | Owner: Nick | Priority: P0
> Created: 2026-03-25 | Target: TBD

## 1. 背景與目標

### 問題陳述

內容創作者拍攝影片後，後製環節佔據大量時間：剪掉語助詞和空白、標記章節、挑選精華片段、為不同平台調整格式。這些重複性工作讓「拍 2 小時、剪 8 小時」成為常態，嚴重拖慢內容產出頻率。

**核心痛點：後製中有大量可被 AI 自動化的重複勞動。**

### 目標

- 利用 Whisper word-level timestamps + GPT 語意分析，自動化後製中的重複工作
- 創作者從「逐幀手動剪」轉變為「審核 AI 建議 → 一鍵產出」
- 提升影片產出效率，讓創作者專注在創意而非勞動

### 成功指標

| 指標 | 目前值 | 目標值 |
|------|--------|--------|
| 單支影片後製時間 | 4-8 小時 | < 1 小時（審核 AI 建議） |
| 章節標記覆蓋率 | 0%（手動） | 100%（自動生成） |
| 多平台版本製作時間 | 每個平台 30 分鐘 | 一鍵全部產出 |

---

## 2. 用戶故事與驗收條件

### Story 1: AI 去語助詞（Filler Word Detection）

**作為** 內容創作者，**我想要** AI 自動標記影片中的語助詞位置，**以便** 我可以選擇性移除這些片段讓影片更緊湊。

**驗收條件 (Acceptance Criteria):**
- [ ] AC1: Given 影片已有轉錄稿, When 創作者點擊「偵測語助詞」, Then 系統使用 Whisper verbose_json 取得 word-level timestamps 並標記出語助詞位置
- [ ] AC2: Given 語助詞已標記, When 創作者查看標記列表, Then 每個標記顯示：時間戳、語助詞文字、前後語境（前後各 5 個詞）
- [ ] AC3: Given 創作者已勾選要移除的片段, When 點擊「產出裁切版」, Then FFmpeg 自動裁切並拼接，產出新影片檔
- [ ] AC4: Given 裁切版產出完成, When 創作者查看結果, Then 顯示原始時長 vs 裁切後時長的對比

### Story 2: AI 章節標記（Chapter Markers）

**作為** 內容創作者，**我想要** AI 自動產出 YouTube 格式的章節時間戳，**以便** 我可以直接貼到影片描述欄。

**驗收條件 (Acceptance Criteria):**
- [ ] AC1: Given 影片已有轉錄稿, When 創作者點擊「生成章節」, Then AI 分析轉錄稿主題轉換點，產出 YouTube 章節格式
- [ ] AC2: Given 章節已生成, When 創作者查看結果, Then 顯示章節列表：時間戳 + 章節標題（繁體中文）
- [ ] AC3: Given 創作者在章節列表, When 編輯章節標題或調整時間, Then 可即時修改並儲存
- [ ] AC4: Given 章節列表確認完成, When 點擊「複製」, Then 將 YouTube 格式的章節文字複製到剪貼簿

### Story 3: AI 精華片段偵測升級

**作為** 內容創作者，**我想要** AI 用更精準的方式找出影片精華片段，**以便** 我可以快速製作高品質的短影片。

**驗收條件 (Acceptance Criteria):**
- [ ] AC1: Given 影片已處理完成, When AI 生成剪輯片段, Then 使用 Whisper word-level timestamps 精準定位，而非比例推估
- [ ] AC2: Given 精華片段已偵測, When 創作者查看片段, Then 每個片段包含：精準時間戳（秒級）、對應文字、推薦原因（金句/高潮/技巧/爭議/轉折）、推薦分數
- [ ] AC3: Given 片段列表, When 創作者調整起止時間, Then 可拖曳微調並即時預覽對應的轉錄文字

### Story 4: 一鍵多平台適配

**作為** 內容創作者，**我想要** 選擇一個影片片段後一鍵產出多個平台版本，**以便** 不需要為每個平台手動調整格式。

**驗收條件 (Acceptance Criteria):**
- [ ] AC1: Given 創作者選中一個剪輯片段, When 點擊「多平台適配」, Then 可勾選目標平台（YouTube Shorts / Instagram Reels / TikTok / IG 正方形）
- [ ] AC2: Given 已選擇目標平台, When 點擊「生成全部」, Then 系統並行產出所有選中平台的版本（含格式轉換 + 字幕 + AI 文案）
- [ ] AC3: Given 多平台版本生成完成, When 創作者查看結果, Then 每個版本顯示：縮圖預覽、格式、時長、平台專屬文案 + Hashtag
- [ ] AC4: Given 多平台版本已就緒, When 創作者點擊「全部排程」, Then 將所有版本送入排程系統

### Story 5: AI 影片腳本摘要（Script Summary）

**作為** 內容創作者，**我想要** AI 產出影片的結構化腳本大綱，**以便** 我可以用來寫文章、做簡報或作為影片描述。

**驗收條件 (Acceptance Criteria):**
- [ ] AC1: Given 影片已有轉錄稿, When 創作者點擊「生成腳本摘要」, Then AI 分析轉錄稿並產出結構化大綱
- [ ] AC2: Given 腳本摘要已生成, When 創作者查看結果, Then 包含：段落結構（Intro/各重點/結尾）、每段核心論點、每段時間範圍、關鍵字標籤
- [ ] AC3: Given 腳本摘要完成, When 點擊「複製」或「匯出 Markdown」, Then 可複製純文字或下載 .md 檔案

---

## 3. 功能規格

### 3.1 Whisper Word-Level Timestamps（基礎升級）

- **描述**: 升級現有 Whisper 轉錄，支援 `verbose_json` 格式取得 word-level timestamps
- **影響範圍**: AiService.transcribe() 新增 `timestamp_granularities` 參數
- **資料結構**:
```typescript
interface WhisperWord {
  word: string;
  start: number;  // 秒
  end: number;    // 秒
}
interface WhisperVerboseResult {
  text: string;
  words: WhisperWord[];
  segments: WhisperSegment[];
}
```
- **存儲**: 存入 Video.metadata JSON 欄位，key 為 `whisperWords`

### 3.2 AI 去語助詞

- **偵測邏輯**: 從 Whisper word-level 資料中匹配預定義的語助詞列表
- **語助詞列表**（繁中/國語常見）:
  - 嗯、啊、呃、那個、就是、然後、對、基本上、所以說、怎麼說、其實
  - 可自訂追加
- **標記資料結構**:
```typescript
interface FillerMark {
  id: string;
  word: string;
  startTime: number;
  endTime: number;
  contextBefore: string;  // 前 5 詞
  contextAfter: string;   // 後 5 詞
  selected: boolean;      // 使用者是否勾選移除
}
```
- **裁切邏輯**: FFmpeg concat filter — 將非移除區間拼接

### 3.3 AI 章節標記

- **AI 模型**: GPT-4o-mini（成本考量，章節分析不需要最強模型）
- **輸入**: 轉錄稿 + word-level timestamps
- **輸出格式**:
```
00:00 開場介紹
02:15 為什麼這很重要
05:30 實作步驟一
08:45 實作步驟二
12:00 常見問題
14:30 總結與下一步
```

### 3.4 精華片段偵測升級

- **升級現有 VideoService.generateAiClips()** 方法
- **變更點**:
  - 輸入增加 word-level timestamps
  - AI 回傳精準秒數（非比例推估）
  - 新增推薦原因分類
- **向下相容**: 無 word-level 資料時退回原邏輯

### 3.5 一鍵多平台適配

- **擴展 ShortVideoService**
- **新增 batch 方法**: `generateMultiPlatform(videoId, clipId, userId, platforms[])`
- **平台配置**:
  | 平台 | 格式 | 字幕 | 文案風格 |
  |------|------|------|----------|
  | YouTube Shorts | 9:16 | 是 | 知識/Hook 導向 |
  | Instagram Reels | 9:16 | 是 | Emoji 豐富 |
  | TikTok | 9:16 | 是 | 潮流/年輕化 |
  | IG 正方形 | 1:1 | 是 | 精簡 |

### 3.6 AI 影片腳本摘要

- **AI 模型**: GPT-4o-mini
- **輸出結構**:
```typescript
interface ScriptSummary {
  title: string;
  totalDuration: string;
  sections: Array<{
    title: string;
    timeRange: string;     // "02:15 - 05:30"
    keyPoints: string[];
    keywords: string[];
  }>;
  tags: string[];
  oneLinerSummary: string;
}
```

---

## 4. UI/UX 流程

### 頁面清單

| 頁面 | 位置 | 描述 |
|------|------|------|
| 後製工具面板 | 影片詳情 Dialog 內新增「後製工具」Tab | 所有後製功能入口 |

### 核心流程

```
影片詳情 Dialog
├── Tab: 基本資訊（現有）
├── Tab: AI 剪輯片段（現有，升級精華偵測）
├── Tab: 推廣內容（上一個功能）
└── Tab: 後製工具（NEW）
    ├── 去語助詞
    │   ├── [偵測語助詞] 按鈕
    │   ├── 標記列表（勾選框 + 時間戳 + 語境）
    │   ├── 統計：偵測到 X 個，已選 Y 個，預計縮短 Z 秒
    │   └── [產出裁切版] 按鈕
    ├── 章節標記
    │   ├── [生成章節] 按鈕
    │   ├── 章節列表（可編輯標題 + 時間）
    │   └── [複製 YouTube 格式] 按鈕
    ├── 腳本摘要
    │   ├── [生成摘要] 按鈕
    │   ├── 結構化大綱展示
    │   └── [複製] [匯出 Markdown] 按鈕
    └── 多平台適配
        ├── 片段選擇（從現有 clips 選）
        ├── 平台勾選（Shorts / Reels / TikTok / IG正方形）
        ├── [生成全部] 按鈕
        └── 結果卡片（縮圖 + 下載 + 排程）
```

---

## 5. 範圍定義

### In Scope（本次實作）

- AiService 升級：支援 Whisper verbose_json（word-level timestamps）
- AI 去語助詞：偵測 + 標記 + FFmpeg 裁切
- AI 章節標記：生成 + 編輯 + 複製 YouTube 格式
- AI 精華片段升級：word-level 精準定位（合併現有 generateAiClips）
- 一鍵多平台適配：擴展 ShortVideoService 的 batch 方法
- AI 影片腳本摘要：生成 + 複製 + 匯出 Markdown
- 前端後製工具面板 UI

### Out of Scope（未來考慮）

- 影片內音效/音樂偵測
- AI 自動配樂建議
- 影片畫面分析（物體偵測、場景切換）
- Podcast chapter 格式
- 即時預覽（需要前端影片播放器深度整合）
- 語助詞自訂詞庫管理介面

---

## 6. 非功能需求

- **效能**: 語助詞偵測 < 10 秒、章節生成 < 15 秒、腳本摘要 < 15 秒
- **成本**: 單支影片所有後製功能的 AI 成本 < $0.10（GPT-4o-mini 為主）
- **可靠性**: FFmpeg 裁切失敗不影響原始影片
- **安全**: 裁切產出的新檔案與原始檔案分開存儲，不覆蓋原檔
- **多租戶**: 所有新增資料遵循 tenantId 隔離

---

## 7. 風險與未決事項

| 項目 | 影響 | 狀態 |
|------|------|------|
| Whisper verbose_json 中文 word-level 精準度 | 中文斷詞邊界可能不如英文精確 | 需實測，可用 segment-level 作為 fallback |
| FFmpeg concat 裁切後音訊不連續 | 可能產生爆音或卡頓 | 加入短淡入淡出（10ms crossfade） |
| 長影片（>1hr）的 word-level 資料量大 | 存儲和前端渲染效能 | 限制 word-level 只用於 < 60 分鐘影片 |
| 多平台 batch 生成的 FFmpeg 資源佔用 | 同時處理 4 個版本可能吃滿 CPU | 使用 BullMQ 限制並發數 |

---

## 8. 里程碑

| 階段 | 內容 | 說明 |
|------|------|------|
| Phase 1 | Whisper 升級 + 去語助詞 + 章節標記 | 基礎升級 + 兩個獨立功能 |
| Phase 2 | 精華片段升級 + 腳本摘要 | 升級現有功能 + 新增分析功能 |
| Phase 3 | 多平台適配 + 前端 UI 整合 | 完整用戶體驗 |
