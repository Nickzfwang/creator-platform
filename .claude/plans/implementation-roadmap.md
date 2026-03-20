# Creator Platform — 完整實作路線圖

## Phase A: YouTube 社群整合 ✅ 已完成
- YouTube OAuth 連結
- YouTube 數據同步（頻道資訊、訂閱數）
- Token 自動刷新
- 排程發佈影片到 YouTube
- BullMQ 非同步發佈 Worker

---

## Phase B: AI 核心強化（預估 2-3 天）

### 目標
讓 AI 功能從「能跑」變成「有說服力」，完成影片剪輯的最後一哩路。

### B-1: FFmpeg 實際切割影片
- 問題：AI 目前只產生 clip 時間標記（startTime/endTime），clipUrl 為 null
- 實作：`generateClips()` 完成後，用 FFmpeg 根據時間區間切出獨立 .mp4 檔
- 輸出：每個 clip 有真實的 clipUrl，可直接播放和發佈
- 依賴：fluent-ffmpeg 已安裝，只需串接

### B-2: Shorts 直式影片真實生成
- 問題：`generateShort()` / `generateAllShorts()` 的輸出需驗證
- 實作：FFmpeg 裁切 9:16 + 加入字幕燒錄
- 輸出：可直接上傳到 YouTube Shorts 的直式影片

### B-3: AI 工作流自動化
- 上傳影片後，自動觸發完整 pipeline：
  1. FFmpeg 提取音訊 → Whisper 轉錄 → GPT 校正字幕
  2. GPT 分析內容 → 產生 AI 摘要
  3. GPT 推薦剪輯點 → FFmpeg 切割 clips
  4. 全部完成後通知前端
- 用 BullMQ 串接，每一步是一個 job

### B-4: AI 生成品質提升
- 腳本生成：加入 few-shot examples，提升結構品質
- 貼文生成：針對每個平台加入更細緻的 prompt engineering
- 字幕校正：加入斷句優化、專有名詞處理

### 前置條件
- 無外部依賴，純程式碼實作
- OpenAI API key 已有（$10 預算足夠測試）

---

## Phase C: 多平台社群整合（預估 3-5 天）

### 目標
至少再接通 2 個平台，讓「跨平台」不只是 UI 上的標籤。

### C-1: Instagram / Facebook（Meta Graph API）
- 前置：需要 Facebook Developer App + App Review
- 功能：
  - OAuth 連結 Instagram Business / Facebook Page
  - 發佈圖文貼文（Instagram Feed / Facebook Page Post）
  - 同步粉絲數、互動數據
- 注意：Instagram 不支援 API 直接上傳影片到 Reels（需用 Content Publishing API）
- 替代方案：如果 App Review 耗時，先實作 Facebook Page 發文（審核較快）

### C-2: TikTok（Content Posting API）
- 前置：需要 TikTok Developer App
- 功能：
  - OAuth 連結
  - 上傳影片到 TikTok
  - 同步粉絲數、影片觀看數
- 注意：TikTok API 有上傳限制，需要 Sandbox → Production 審核

### C-3: Twitter / X（API v2）
- 前置：需要 Twitter Developer Account（Free tier 只能發推，$100/mo Basic 才有全功能）
- 功能：
  - OAuth 2.0 PKCE 連結
  - 發推（文字 + 圖片）
  - 同步粉絲數
- 成本考量：Free tier 足夠 demo，只是限制每月 1500 則推文

### C-4: Threads（Threads API）
- 前置：依附 Instagram Business 帳號
- 功能：發文 + 同步數據
- 注意：需先完成 C-1 的 Meta 整合

### 建議優先級
1. **Twitter/X**（最快，Free tier 不需審核，OAuth 最簡單）
2. **Instagram/Facebook**（最有商業價值，但需 Meta 審核）
3. **TikTok**（短影音重要，但 API 審核嚴格）
4. **Threads**（依賴 Instagram，最後做）

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
