# Creator Platform — 完整實作路線圖

## Phase A: YouTube 社群整合 ✅ 已完成
- YouTube OAuth 連結
- YouTube 數據同步（頻道資訊、訂閱數）
- Token 自動刷新
- 排程發佈影片到 YouTube
- BullMQ 非同步發佈 Worker

---

## Phase B: AI 核心強化 ✅ 已完成

### 目標
讓 AI 功能從「能跑」變成「有說服力」，完成影片剪輯的最後一哩路。

### B-1: FFmpeg 實際切割影片 ✅
- `generateAiClips()` 完成後，用 FFmpeg 根據時間區間切出獨立 .mp4 檔
- 每個 clip 有真實的 clipUrl，可直接播放和發佈
- 短影片（≤60s）也會生成 clip 檔案

### B-2: 上傳後自動化 Pipeline ✅
- `handleDirectUpload()` 自動執行完整 pipeline：
  1. FFmpeg 提取音訊 → Whisper 轉錄逐字稿
  2. GPT 根據逐字稿生成高品質 AI 摘要
  3. GPT 根據逐字稿推薦精準剪輯點 → FFmpeg 切割 clips
- 新增 `transcribeVideo()` 和 `generateAiSummaryFromTranscript()` 方法

### B-3: Shorts 直式影片生成 ✅
- `ShortVideoService` 使用 FFmpeg 裁切 9:16 / 1:1 + 字幕燒錄
- 修復：改用注入的 `AiService.transcribe()` 取代直接建立 OpenAI 實例
- 修復：TypeScript 類型錯誤

### B-4: AI 生成品質提升 ✅
- 全部 AI 模型從 gpt-4o-mini 升級為 gpt-4o
- 腳本生成：加入 few-shot examples（Hook 範例）、縮圖建議、剪輯建議
- 貼文生成：每個平台加入詳細的字數限制、策略說明和差異化要求
- 字幕校正：加入專有名詞處理規則、斷句優化規則、標點符號規則
- AI 助手「小創」：強化為數據驅動的顧問角色，要求具體可執行建議

### B-5: Dashboard 真實 YouTube 數據 ✅
- `YouTubeApiService.getRecentVideoStats()`: 取得最近影片的 likes、comments、views
- `SocialSyncService.fetchPlatformMetrics()`: 整合影片級數據到 PlatformAnalytics
- 計算真實 engagement rate: (likes + comments) / views
- 同步 top content（前 5 名影片依觀看排序）

---

## Phase C: 多平台社群整合 ✅ 已完成

### 目標
至少再接通 2 個平台，讓「跨平台」不只是 UI 上的標籤。

### C-1: Twitter/X（API v2）✅
- `TwitterApiService`: OAuth 2.0 + PKCE 完整流程
- 功能：OAuth 連結、發推（文字）、同步粉絲數/推文互動、token 自動刷新
- 發佈：`PostPublishProcessor.publishToTwitter()` — 自動截斷 280 字
- 數據同步：粉絲數、likes、retweets、impressions、engagement rate
- 前置：需要 Twitter Developer Account（Free tier 足夠 demo）

### C-2: Instagram / Facebook（Meta Graph API）✅
- `MetaApiService`: 統一處理 Facebook + Instagram
- Facebook:
  - OAuth 連結、Page 發文（文字/圖片）、粉絲數同步
  - 使用 Page Access Token（long-lived, 60 天）
- Instagram:
  - 透過 Facebook Page 連結 Instagram Business Account
  - Content Publishing API 發佈圖片/Reels
  - 粉絲數、like_count、comments_count 同步
  - Engagement rate 計算
- 前置：需要 Facebook Developer App + App Review

### C-3: TikTok（Content Posting API v2）✅
- `TikTokApiService`: OAuth 2.0 完整流程
- 功能：OAuth 連結、影片上傳（URL pull 方式）、同步粉絲數/觀看數
- 數據同步：followers、views、likes、comments、shares、engagement rate
- 前置：需要 TikTok Developer App + Sandbox → Production 審核

### C-4: Threads ✅（部分）
- OAuth 連結已實作（透過 Meta Graph API）
- 發佈功能待 Threads API v2 正式開放
- 數據同步暫返回零值

### 整合架構
- `social.service.ts`: 統一 OAuth connect/callback/disconnect/refresh，switch-case 分發
- `social-sync.service.ts`: 6 小時 cron 同步所有平台數據，各平台獨立 metrics 處理
- `post-publish.processor.ts`: BullMQ worker 支援 5 個平台發佈
- `social.module.ts`: 匯出 4 個 API service（YouTube, Twitter, Meta, TikTok）

---

## Phase D: 變現功能落地（預估 2-3 天）

### 目標
讓「賺錢」這件事真正跑通，不是 UI 上的數字。

### D-1: Stripe 支付串接
- 替換所有 placeholder session/checkout
- 實作 Stripe Checkout Session 建立（真實 URL）
- 實作 Webhook 處理：payment_intent.succeeded → 更新訂單狀態
- 實作 Stripe Connect（創作者收款分潤）
- 前置：需要 Stripe 帳號（Test mode 不需審核）

### D-2: Email 實際寄送
- 選型：SendGrid（Free tier 100封/天）或 Resend（Free tier 3000封/月）
- 實作：
  - Campaign 狀態改為 SENDING 時觸發 BullMQ job
  - 批量寄信 + 追蹤 open/click（SendGrid webhook）
  - 更新 sentCount / openCount / clickCount
- 前置：需要 SendGrid 或 Resend API key

### D-3: 會員訂閱
- 用 Stripe Subscriptions 處理月繳/年繳
- 會員等級 → Stripe Price 對應
- 訂閱 webhook → 更新會員狀態

---

## Phase E: 數據智能（預估 2-3 天）

### 目標
讓數據分析從「顯示數字」升級到「給建議」。

### E-1: 知識庫向量搜尋
- 啟用 pgvector extension
- 上傳知識文件時，用 OpenAI Embeddings 生成向量
- Bot 對話時用向量相似度搜尋相關段落
- 目前是全文搜尋 fallback，效果差

### E-2: 跨平台數據分析
- 從各社群 API 拉取真實互動數據（不只是粉絲數）
- YouTube：最近影片的觀看/按讚/留言
- Instagram：貼文觸及率、Story 觀看
- 計算真實的 engagement rate

### E-3: AI 智慧建議
- 根據歷史數據分析最佳發佈時間
- 根據內容表現推薦主題方向
- 根據粉絲成長趨勢給出策略建議
- 用 GPT-4o 分析數據後產生自然語言洞察

---

## Phase F: 基礎建設（預估 1-2 天）

### 目標
讓系統可以上 production。

### F-1: S3 雲端儲存
- 替換本地 /uploads/ 為 AWS S3
- 實作 presigned URL 上傳（前端直傳 S3）
- CDN 配合影片分發

### F-2: 安全強化
- OAuth state 存 Redis（CSRF 防護）
- Rate limiting 強化
- API key 權限細化
- 敏感資料加密複查

### F-3: 效能優化
- Redis 快取熱門查詢（dashboard、analytics）
- BullMQ 併發控制
- 資料庫 index 最佳化

---

## 實作順序建議

```
Phase A ✅ (已完成)
  ↓
Phase B (AI 核心) ← 最優先，提升核心體驗
  ↓
Phase D-1 (Stripe) ← 變現是商業核心
  ↓
Phase C-1~C-2 (Twitter + Instagram) ← 擴展平台
  ↓
Phase D-2 (Email 寄送) ← 完成行銷閉環
  ↓
Phase E (數據智能) ← 提升分析價值
  ↓
Phase F (基礎建設) ← 上線前準備
```

## 預估總時程
- 最小可 demo 版（Phase B + D-1）：4-5 天
- 完整版（全部 Phase）：12-16 天

## 成本預估
| 項目 | 費用 |
|------|------|
| OpenAI API（GPT-4o + Whisper）| ~$10-30/月（依用量） |
| Stripe | 免費（Test mode）、上線後 2.9% + $0.30 / 筆 |
| SendGrid 或 Resend | 免費（Free tier） |
| AWS S3 | ~$5/月（小量影片） |
| Twitter API | 免費（Free tier）或 $100/月（Basic） |
| Meta / TikTok API | 免費 |
