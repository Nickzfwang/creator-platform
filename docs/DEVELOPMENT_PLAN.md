# Creator Platform — 開發計畫文檔

> 本文檔用於追蹤所有待開發項目，供新 session 參考使用。

---

## 專案現況

### 已完成
- [x] Monorepo 架構建立（Turborepo + pnpm）
- [x] Next.js 14 前端骨架（apps/web）
- [x] NestJS 後端骨架（apps/api）含 12 個業務模組 stub
- [x] Prisma Schema 完整定義（24 models, 18 enums）
- [x] 共用套件（shared-types, utils）
- [x] Docker Compose（PostgreSQL pgvector + Redis）
- [x] Dockerfile（API + Worker）
- [x] CLAUDE.md 開發規範
- [x] 相依套件安裝完成
- [x] **Phase 1 後端 API 全部完成**（Auth, Tenant, User, Video, Social, Post Scheduler, Payment, Dashboard）
- [x] **Phase 2 後端 API 全部完成**（Affiliate, Knowledge Base, Bot, Membership, More Platforms, Advanced Analytics）
- [x] **Phase 3 後端 API 全部完成**（Brand Deal, White-label Tenant, API Gateway, More Platforms, AI Posting Times）

### 啟動指令
```bash
cd /Users/nickwang/Documents/creator-platform
docker compose up -d          # 啟動 PostgreSQL + Redis
cp .env.example .env          # 建立環境變數檔（需填入 API keys）
pnpm db:push                  # 建立資料庫表
pnpm dev                      # 啟動前後端
```

---

## Phase 1：核心基盤 + 影片剪輯（目標 8-10 週）

> **後端 API 層全數完成。** 各模組 Service 含完整 Prisma 查詢、DTO 驗證、ownership 檢查、cursor-based 分頁。
> 外部服務整合（S3、Stripe SDK、OpenAI、YouTube/Instagram API）標記為 TODO，可在帳號就緒後逐步接入。
> 前端頁面尚未實作。

### 1.1 認證系統 ✅
**檔案位置：** `apps/api/src/modules/auth/`、`apps/web/app/(auth)/`

後端 API：
- [x] Prisma Client 初始化與注入（`prisma.module.ts` @Global）
- [x] 註冊 API（bcrypt 12 rounds、建立 User + 預設 Tenant）
- [x] 登入 API（JWT 15min access + 7d refresh token）
- [x] JWT Strategy（passport-jwt 整合）
- [x] Auth Guard（JwtAuthGuard）
- [x] Refresh Token API
- [x] Logout API（revoke refresh token）

待完成：
- [ ] Tenant Guard 從 JWT 解析 tenant context
- [ ] Google OAuth 登入（NextAuth.js 前端 + 後端回呼）
- [x] 前端登入/註冊頁面 UI（表單驗證、錯誤提示）
- [x] 前端 Auth Context / Token 管理（存儲、自動刷新、過期處理）

### 1.2 使用者管理 ✅
**檔案位置：** `apps/api/src/modules/user/`

後端 API：
- [x] GET /v1/users/me — 取得個人資料（排除敏感欄位）
- [x] PATCH /v1/users/me — 更新 displayName, avatarUrl, locale, timezone
- [x] POST /v1/users/me/onboarding — 完成 onboarding（role, socialPlatforms）
- [x] GET /v1/users/me/social-accounts — 列出社群帳號（排除 token）
- [x] DELETE /v1/users/me/social-accounts/:id — 斷開社群帳號

待完成：
- [ ] 前端個人設定頁面
- [ ] 前端 onboarding 流程 UI

### 1.3 多租戶基礎 ✅
**檔案位置：** `apps/api/src/modules/tenant/`、`apps/api/src/common/`

後端 API：
- [x] Prisma Middleware 自動注入 tenant_id 至所有查詢
- [x] 預設 Tenant 種子資料（seed script）
- [x] Tenant Resolver（從 JWT / subdomain 解析）
- [x] GET /v1/tenant/current — 取得當前 tenant
- [x] PATCH /v1/tenant/settings — 更新 tenant 設定

待完成：
- [ ] PostgreSQL Row-Level Security 策略建立

### 1.4 影片上傳 + AI 剪輯 ✅（API 層）
**檔案位置：** `apps/api/src/modules/video/`、`apps/api/src/workers/`

後端 API：
- [x] POST /v1/videos/upload-url — 取得上傳 URL（TODO: S3 presigned）
- [x] POST /v1/videos/:id/uploaded — 標記上傳完成、觸發處理
- [x] GET /v1/videos — 影片列表（cursor-based 分頁、搜尋、排序）
- [x] GET /v1/videos/:id — 影片詳情（含 clips）
- [x] DELETE /v1/videos/:id — 刪除影片（ownership 檢查）
- [x] GET /v1/videos/:id/clips — 取得 clips
- [x] PATCH /v1/videos/:id/clips/:clipId — 更新 clip 標題/描述/hashtags

待完成（外部服務整合）：
- [ ] S3 Presigned URL 實際產生
- [ ] BullMQ 影片處理佇列（`video-processing` queue）
- [ ] Video Processing Worker（FFmpeg + Whisper + GPT-4o）
- [ ] Worker 錯誤處理與重試機制
- [ ] WebSocket / SSE 即時進度通知
- [ ] 前端影片管理頁面（上傳、列表、Clip 預覽、編輯）

### 1.5 社群平台連結 ✅（API 層）
**檔案位置：** `apps/api/src/modules/social/`

後端 API：
- [x] GET /v1/social/connect/:platform — OAuth 連結（302 redirect）
- [x] GET /v1/social/callback/:platform — OAuth 回呼（state 驗證、token 加密存儲）
- [x] GET /v1/social/accounts — 列出已連結帳號（含 tokenStatus）
- [x] DELETE /v1/social/accounts/:id — 斷開帳號
- [x] POST /v1/social/accounts/:id/refresh — 刷新 token
- [x] EncryptionService（AES-256-GCM + key rotation）

待完成（外部服務整合）：
- [ ] YouTube OAuth 2.0 實際 token exchange
- [ ] Instagram Graph API OAuth 實際 token exchange
- [ ] Token 自動刷新排程（cron job）
- [ ] Redis state 暫存（取代 base64url state）
- [ ] 前端社群帳號連結管理 UI

### 1.6 排程發佈 ✅（API 層）
**檔案位置：** `apps/api/src/modules/post-scheduler/`

後端 API：
- [x] POST /v1/posts — 建立貼文（手動/Clip 匯入，DRAFT/SCHEDULED）
- [x] GET /v1/posts — 貼文列表（cursor-based 分頁、狀態/類型/日期篩選）
- [x] GET /v1/posts/:id — 貼文詳情
- [x] PATCH /v1/posts/:id — 更新貼文（DRAFT/SCHEDULED only）
- [x] DELETE /v1/posts/:id — 刪除貼文（DRAFT/SCHEDULED only）
- [x] POST /v1/posts/:id/publish-now — 立即發佈
- [x] POST /v1/posts/ai-generate — AI 生成貼文內容（placeholder GPT-4o）

待完成（外部服務整合）：
- [ ] BullMQ delayed job 排程機制
- [ ] GPT-4o 貼文內容生成
- [ ] YouTube 影片上傳 API 整合
- [ ] Instagram Reels/貼文發佈 API 整合
- [ ] 發佈結果記錄（成功/失敗處理）
- [ ] 前端排程管理頁面（日曆視圖、貼文編輯器、拖拉排程）

### 1.7 Stripe 訂閱 ✅（API 層）
**檔案位置：** `apps/api/src/modules/payment/`

後端 API：
- [x] GET /v1/subscriptions/plans — 列出方案（公開，Free/Starter/Pro/Business）
- [x] GET /v1/subscriptions/current — 當前訂閱、用量、百分比
- [x] POST /v1/subscriptions/checkout — 建立 Checkout Session
- [x] POST /v1/subscriptions/portal — 建立 Customer Portal
- [x] POST /v1/webhooks/stripe — Webhook 處理（5 種事件）
- [x] PaymentService.recordUsage() — 用量追蹤
- [x] PaymentService.checkUsageLimit() — 額度檢查
- [x] Plan limits 常數定義（constants/plan-limits.ts）

待完成（Stripe SDK 整合）：
- [ ] Stripe SDK 初始化（stripe npm package）
- [ ] Stripe Customer 建立與管理
- [ ] Stripe Checkout Session 實際建立
- [ ] Stripe Customer Portal 實際建立
- [ ] Stripe Webhook 簽名驗證（constructEvent）
- [ ] Stripe Price ID 環境變數對應
- [ ] UsageLimitGuard 裝飾器（各模組 Controller 使用）
- [ ] 前端方案選擇 / 升級頁面
- [ ] 前端帳單管理（Customer Portal redirect）

### 1.8 儀表板首頁 ✅（API 層）
**檔案位置：** `apps/api/src/modules/dashboard/`、`apps/web/app/(dashboard)/`

後端 API：
- [x] GET /v1/dashboard/overview — 總覽指標、趨勢、Top 內容、平台分析（7d/30d/90d）
- [x] GET /v1/dashboard/recent-posts — 即將排程的貼文
- [x] GET /v1/dashboard/quick-stats — 今日快照、訂閱用量、已連結平台

待完成：
- [ ] Redis 快取（overview 5min, quick-stats 1min）
- [ ] 前端儀表板總覽頁：
  - [ ] 關鍵指標卡片（粉絲數、觀看數、收入、互動率）
  - [ ] 趨勢圖表（Recharts AreaChart）
  - [ ] Platform breakdown 卡片
  - [ ] 近期排程列表
  - [ ] 快捷操作按鈕
  - [ ] 空狀態引導提示
  - [ ] Responsive 設計（Desktop/Tablet/Mobile）

---

## Phase 2：社群變現（目標 6-8 週）

> **後端 API 層全數完成。** 各模組 Service 含完整 Prisma 查詢、DTO 驗證、ownership 檢查、cursor-based 分頁。
> 外部服務整合（OpenAI Embeddings、pgvector cosine search、Stripe Connect、平台 API）標記為 TODO。
> 前端頁面尚未實作。

### 2.1 聯盟行銷追蹤 ✅（API 層）
**檔案位置：** `apps/api/src/modules/affiliate/`

後端 API：
- [x] POST /v1/affiliate/links — 建立追蹤連結（8-char hex trackingCode）
- [x] GET /v1/affiliate/links — 列表（cursor-based 分頁、搜尋、isActive 篩選）
- [x] GET /v1/affiliate/links/:id — 詳情（含事件統計）
- [x] PATCH /v1/affiliate/links/:id — 更新
- [x] DELETE /v1/affiliate/links/:id — 停用（soft delete）
- [x] POST /v1/affiliate/events — 回報轉換事件
- [x] GET /v1/affiliate/stats — 統計（按期間、按連結）
- [x] GET /r/:trackingCode — 短網址重導向（302、記錄 click + IP hash）

待完成：
- [ ] 前端聯盟連結管理頁
- [ ] 前端轉換數據儀表板（點擊率、轉換率、收益）

### 2.2 知識庫 + RAG 顧問 Bot ✅（API 層）
**檔案位置：** `apps/api/src/modules/knowledge-base/`、`apps/api/src/modules/bot/`

後端 API（知識庫）：
- [x] POST /v1/knowledge-bases — 建立知識庫
- [x] GET /v1/knowledge-bases — 列表（cursor-based 分頁、搜尋、狀態篩選）
- [x] GET /v1/knowledge-bases/:id — 詳情（含 chunk 數量）
- [x] POST /v1/knowledge-bases/:id/ingest — 匯入文字內容（自動切割 500 words, 100 overlap）
- [x] DELETE /v1/knowledge-bases/:id — 刪除（級聯刪除 chunks）

後端 API（Bot）：
- [x] POST /v1/bots — 建立 Bot（含 personality、knowledgeBaseId）
- [x] GET /v1/bots — 列表（含知識庫 + 對話數量）
- [x] GET /v1/bots/:id — 詳情
- [x] PATCH /v1/bots/:id — 更新
- [x] DELETE /v1/bots/:id — 刪除（級聯刪除對話）
- [x] POST /v1/bots/:id/chat — 公開對話（RAG context + placeholder GPT-4o）
- [x] GET /v1/bots/:id/conversations — 對話列表（Creator 管理）

待完成（外部服務整合）：
- [ ] OpenAI Embedding API 向量化
- [ ] pgvector cosine similarity 搜索（替代 fallback text search）
- [ ] GPT-4o 實際串接（替代 placeholder 回覆）
- [ ] LLM 串流回覆（SSE / WebSocket）
- [ ] Bot 嵌入 Widget（iframe / JS SDK）
- [ ] 前端 Bot 設定 / 對話介面

### 2.3 粉絲付費會員 ✅（API 層）
**檔案位置：** `apps/api/src/modules/membership/`

後端 API：
- [x] POST /v1/membership/tiers — 建立會員等級
- [x] GET /v1/membership/tiers — 列出 Creator 的等級（含會員數）
- [x] GET /v1/membership/tiers/public/:creatorUserId — 公開等級列表（Fan 端）
- [x] PATCH /v1/membership/tiers/:id — 更新等級
- [x] DELETE /v1/membership/tiers/:id — 刪除等級（有會員時禁止）
- [x] POST /v1/membership/subscribe — 訂閱等級（容量檢查 + 重複檢查）
- [x] GET /v1/membership/members — 會員列表（Creator 端，cursor-based 分頁）
- [x] GET /v1/membership/my — 我的會員資格（Fan 端）
- [x] POST /v1/membership/:id/cancel — 取消會員

待完成（Stripe Connect 整合）：
- [ ] Stripe Connect Express 帳戶建立
- [ ] Stripe Product + Price 建立
- [ ] Stripe Checkout 訂閱購買
- [ ] Stripe Connect 自動分潤
- [ ] Webhook 處理會員狀態變更
- [ ] 前端會員等級管理 / 購買頁

### 2.4 更多平台整合 ✅（API 層）
**檔案位置：** `apps/api/src/modules/social/`

後端 API：
- [x] TikTok OAuth config 新增（client_key, scopes, endpoints）
- [x] Facebook OAuth config 新增（app_id, scopes, endpoints）
- [x] POST /v1/social/sync — 手動觸發全帳號資料同步
- [x] GET /v1/social/sync/status — 查看同步狀態
- [x] SocialSyncService @Cron(EVERY_6_HOURS) — 自動同步 PlatformAnalytics
- [x] @nestjs/schedule 整合（ScheduleModule）

待完成（平台 API 整合）：
- [ ] TikTok Content Posting API 實際整合
- [ ] Facebook Graph API 實際整合
- [ ] 各平台 token exchange 實作
- [ ] 各平台 metrics fetch 實作（替代 placeholder）

### 2.5 進階分析儀表板 ✅（API 層）
**檔案位置：** `apps/api/src/modules/analytics/`

後端 API：
- [x] GET /v1/analytics/overview — 總覽指標 + 前期比較 + 平台 breakdown
- [x] GET /v1/analytics/platform — 平台數據 + 每日趨勢
- [x] GET /v1/analytics/comparison — 跨平台比較
- [x] GET /v1/analytics/revenue — 收入分析（subscription + membership + affiliate）
- [x] GET /v1/analytics/top-content — 內容表現排行

待完成：
- [ ] 前端進階圖表（多維度篩選、日期範圍、Recharts）

---

## Phase 3：完整平台（目標 6-8 週）

> **後端 API 層全數完成。** 品牌合作管線管理、白牌多租戶管理、API Key/Webhook 管理、全平台 OAuth 整合。
> 外部服務整合（GPT-4o 提案生成、PDF 匯出、DNS 驗證、實際 rate limiting）標記為 TODO。
> 前端頁面及 PWA 配置尚未實作。

### 3.1 AI 品牌合作企劃 ✅（API 層）
**檔案位置：** `apps/api/src/modules/brand-deal/`

後端 API：
- [x] POST /v1/brand-deals — 建立品牌合作（DealType + brandContact + budgetRange）
- [x] GET /v1/brand-deals — 列表（cursor-based 分頁、status/dealType/search 篩選）
- [x] GET /v1/brand-deals/:id — 詳情
- [x] PATCH /v1/brand-deals/:id — 更新（含狀態轉換驗證）
- [x] DELETE /v1/brand-deals/:id — 刪除（IN_PROGRESS/COMPLETED 禁止）
- [x] POST /v1/brand-deals/generate-proposal — AI 提案生成（Creator 數據 + 品牌需求）
- [x] GET /v1/brand-deals/pipeline — 管線統計（各狀態數量 + 總收入）
- [x] 狀態機轉換驗證（DRAFT → PROPOSAL_SENT → NEGOTIATING → CONFIRMED → IN_PROGRESS → COMPLETED）

待完成（外部服務整合）：
- [ ] GPT-4o 實際提案生成（替代 placeholder）
- [ ] PDF 匯出（Puppeteer 或 react-pdf）
- [ ] 前端品牌合作管理頁面 + 提案編輯器

### 3.2 白牌多租戶 ✅（API 層）
**檔案位置：** `apps/api/src/modules/tenant/`

後端 API：
- [x] GET /v1/tenant/branding — 取得品牌設定（logo、theme、domain）
- [x] POST /v1/tenant/verify-domain — 自訂域名 DNS 驗證
- [x] GET /v1/tenant/current — 當前 tenant（已有）
- [x] PATCH /v1/tenant/settings — 更新設定（已有，擴展 themeConfig）
- [x] GET /v1/admin/tenants — 列出所有 tenant（Admin，cursor-based 分頁）
- [x] GET /v1/admin/tenants/:id — tenant 詳情
- [x] GET /v1/admin/tenants/:id/stats — tenant 用量統計
- [x] PATCH /v1/admin/tenants/:id — Admin 更新（plan、customDomain、branding）
- [x] GET /v1/admin/tenants/:id/branding — Admin 查看品牌設定
- [x] findByDomain() — 自訂域名解析 tenant

待完成：
- [ ] DNS CNAME 實際驗證（dns.resolveCname）
- [ ] SSL 自動配發（Let's Encrypt / Cloudflare）
- [ ] Admin role guard 強制檢查
- [ ] 前端管理後台 `apps/web/app/(admin)/`

### 3.3 API 開放 ✅（API 層）
**檔案位置：** `apps/api/src/modules/api-gateway/`

後端 API：
- [x] POST /v1/api-gateway/keys — 建立 API Key（SHA-256 hash，raw key 僅返回一次）
- [x] GET /v1/api-gateway/keys — 列出 API Keys（不含 raw key）
- [x] DELETE /v1/api-gateway/keys/:keyId — 撤銷 API Key
- [x] POST /v1/api-gateway/webhooks — 註冊 Webhook（secret 僅返回一次）
- [x] GET /v1/api-gateway/webhooks — 列出 Webhooks
- [x] GET /v1/api-gateway/webhooks/events — 可用事件類型清單
- [x] DELETE /v1/api-gateway/webhooks/:webhookId — 停用 Webhook
- [x] GET /v1/api-gateway/rate-limits — 查看 rate limit 配置（按方案）
- [x] validateApiKey() — API Key 驗證邏輯
- [x] Rate limits 按 TenantPlan 定義（FREE/PRO/ENTERPRISE/WHITELABEL）

待完成：
- [ ] API Key middleware（攔截 `Authorization: Bearer cpk_...`）
- [ ] Redis-based rate limiting（sliding window）
- [ ] Webhook 實際觸發機制（EventEmitter → HTTP POST）
- [ ] API 文件公開頁面

### 3.4 行動端最佳化（前端）
待完成：
- [ ] PWA 配置（manifest.json, service worker）
- [ ] 響應式 UI 全面適配
- [ ] 觸控手勢最佳化

### 3.5 其他平台整合 ✅（API 層）
**檔案位置：** `apps/api/src/modules/social/`、`apps/api/src/modules/post-scheduler/`

後端 API：
- [x] Twitter/X OAuth2 config 新增（client_id, scopes: tweet.read/write）
- [x] Threads OAuth config 新增（app_id, scopes: threads_basic/content_publish）
- [x] SocialSyncService 新增 Twitter + Threads metrics fetch placeholder
- [x] GET /v1/posts/optimal-times — AI 推薦最佳發佈時間（分析歷史數據）
- [x] 所有 6 平台 OAuth 全部配置完成（YouTube, Instagram, TikTok, Facebook, Twitter, Threads）

待完成（平台 API 整合）：
- [ ] Twitter/X API v2 實際 token exchange + 發文
- [ ] Threads API 實際 token exchange + 發文
- [ ] GPT-4o 最佳發佈時間分析（替代 placeholder）
- [ ] 內容趨勢分析 API

---

## 技術債 / 基礎設施待辦

- [ ] CI/CD Pipeline（GitHub Actions：lint → test → build → deploy）
- [ ] 單元測試覆蓋（每模組 `__tests__/` 目錄）
- [ ] E2E 測試（Playwright 或 Cypress）
- [ ] 日誌系統（結構化日誌、Sentry 錯誤追蹤）
- [ ] 監控告警（健康檢查端點、Uptime 監控）
- [ ] 資料庫備份策略
- [ ] CDN 快取策略（S3 lifecycle + CloudFront TTL）
- [ ] 安全掃描（Dependabot / Snyk、容器映像掃描）
- [ ] 效能最佳化（資料庫索引調校、N+1 查詢檢測、Redis 快取策略）

---

## 收費方案定義

| 方案 | 月費 | 影片/月 | 排程貼文/月 | Bot 訊息/月 | 品牌企劃/月 |
|------|------|---------|-------------|-------------|-------------|
| Free | $0 | 3 | 30 | 100 | 1 |
| Starter | $29 | 15 | 150 | 1,000 | 5 |
| Pro | $79 | 50 | 500 | 5,000 | 20 |
| Business | $199 | 無限 | 無限 | 無限 | 無限 |

抽成比例：會員訂閱 10%、Bot 按次 15%、聯盟行銷 5%
白牌年費：$5,000-$20,000（依 MAU 階梯）

---

## 環境變數清單（需在 .env 填入）

| 變數 | 用途 | 取得方式 |
|------|------|---------|
| `DATABASE_URL` | PostgreSQL 連線 | Docker Compose 預設可用 |
| `REDIS_URL` | Redis 連線 | Docker Compose 預設可用 |
| `NEXTAUTH_SECRET` | NextAuth session 加密 | `openssl rand -base64 32` |
| `JWT_SECRET` | JWT 簽名 | `openssl rand -base64 32` |
| `OPENAI_API_KEY` | OpenAI API | https://platform.openai.com/api-keys |
| `STRIPE_SECRET_KEY` | Stripe 後端 | https://dashboard.stripe.com/apikeys |
| `STRIPE_PUBLISHABLE_KEY` | Stripe 前端 | 同上 |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 驗證 | Stripe CLI 或 Dashboard |
| `STRIPE_PRICE_STARTER` | Starter 方案 Price ID | Stripe Dashboard |
| `STRIPE_PRICE_PRO` | Pro 方案 Price ID | Stripe Dashboard |
| `STRIPE_PRICE_BUSINESS` | Business 方案 Price ID | Stripe Dashboard |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | Google Cloud Console |
| `YOUTUBE_CLIENT_ID/SECRET` | YouTube API | Google Cloud Console (啟用 YouTube Data API v3) |
| `INSTAGRAM_APP_ID/SECRET` | Instagram API | Meta Developer Portal |
| `ENCRYPTION_KEY` | OAuth token 加密金鑰 | `openssl rand -hex 16`（16 bytes = AES-128） |
| `ENCRYPTION_KEY_PREVIOUS` | 金鑰輪換用舊金鑰 | 上一個 ENCRYPTION_KEY |
| `TIKTOK_CLIENT_KEY` | TikTok API | TikTok Developer Portal |
| `TIKTOK_CLIENT_SECRET` | TikTok API | 同上 |
| `FACEBOOK_APP_ID` | Facebook Graph API | Meta Developer Portal |
| `FACEBOOK_APP_SECRET` | Facebook Graph API | 同上 |
| `TWITTER_CLIENT_ID` | Twitter/X API v2 | Twitter Developer Portal |
| `TWITTER_CLIENT_SECRET` | Twitter/X API v2 | 同上 |
| `THREADS_APP_ID` | Threads API | Meta Developer Portal |
| `THREADS_APP_SECRET` | Threads API | 同上 |
| `AWS_*` | S3 + CloudFront | AWS IAM Console |

---

## 備註

- Phase 1 + Phase 2 + Phase 3 後端 API 全數完成，Swagger UI 可在 `http://localhost:4000/api/docs` 查看所有端點
- 各模組 Service 含完整 Prisma 查詢，外部服務整合以 TODO 標記
- Phase 2 新增 @nestjs/schedule 用於 cron job（社群資料同步每 6 小時）
- Phase 3 新增 API Gateway 模組（API Key + Webhook 管理，存於 tenant settings JSON）
- 所有 6 個社群平台 OAuth 已配置（YouTube, Instagram, TikTok, Facebook, Twitter/X, Threads）
- 前端使用 shadcn/ui，需透過 `npx shadcn@latest add <component>` 新增 UI 元件
- Prisma Schema 已定義完成，執行 `pnpm db:push` 即可建表
- API port 4000，前端 port 3001
- PostgreSQL 使用 port 5433（避免衝突）
