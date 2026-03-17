# Creator Platform — 開發計畫文檔

> 本文檔用於追蹤所有待開發項目，供新 session 參考使用。

---

## 專案現況

### 已完成
- [x] Monorepo 架構建立（Turborepo + pnpm）
- [x] Next.js 14 前端骨架（apps/web）
- [x] NestJS 後端骨架（apps/api）含 12 個業務模組 stub
- [x] Prisma Schema 完整定義（16 models, 16 enums）
- [x] 共用套件（shared-types, utils）
- [x] Docker Compose（PostgreSQL pgvector + Redis）
- [x] Dockerfile（API + Worker）
- [x] CLAUDE.md 開發規範
- [x] 相依套件安裝完成

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

### 1.1 認證系統
**檔案位置：** `apps/api/src/modules/auth/`、`apps/web/app/(auth)/`

待開發：
- [ ] Prisma Client 初始化與注入（建立 `prisma.service.ts` 或 `prisma.module.ts`）
- [ ] 註冊 API 實作（bcrypt 密碼雜湊、建立 User + 預設 Tenant）
- [ ] 登入 API 實作（JWT 簽發、Refresh Token 機制）
- [ ] JWT Strategy 實作（passport-jwt 整合）
- [ ] Auth Guard 接上真實 JWT 驗證邏輯
- [ ] Tenant Guard 從 JWT 解析 tenant context
- [ ] Google OAuth 登入（NextAuth.js 前端 + 後端回呼）
- [ ] 前端登入/註冊頁面 UI 完善（表單驗證、錯誤提示）
- [ ] 前端 Auth Context / Token 管理（存儲、自動刷新、過期處理）

### 1.2 使用者管理
**檔案位置：** `apps/api/src/modules/user/`

待開發：
- [ ] GET /me 接上 Prisma 查詢（從 JWT 取 userId）
- [ ] PATCH /me 更新個人資料
- [ ] 使用者 onboarding 流程（選擇角色、連結社群帳號）
- [ ] 前端個人設定頁面

### 1.3 多租戶基礎
**檔案位置：** `apps/api/src/modules/tenant/`、`apps/api/src/common/`

待開發：
- [ ] Prisma Middleware 自動注入 tenant_id 至所有查詢
- [ ] PostgreSQL Row-Level Security 策略建立
- [ ] 預設 Tenant 種子資料（seed script）
- [ ] Tenant Resolver（從 JWT / subdomain 解析）

### 1.4 影片上傳 + AI 剪輯
**檔案位置：** `apps/api/src/modules/video/`、`apps/api/src/workers/`

待開發：
- [ ] S3 Presigned URL 產生 API（安全上傳）
- [ ] 影片上傳回呼處理（S3 event → 更新 Video 狀態）
- [ ] BullMQ 影片處理佇列設定（`video-processing` queue）
- [ ] Video Processing Worker：
  - [ ] FFmpeg 提取音頻
  - [ ] OpenAI Whisper API 語音轉文字（含時間戳）
  - [ ] GPT-4o 分析逐字稿 → 識別精華段落（起止時間、原因、評分）
  - [ ] FFmpeg 按時間戳裁切影片片段
  - [ ] 產生多種比例（9:16, 1:1, 16:9）
  - [ ] 產生縮圖
  - [ ] AI 為每個片段生成標題、描述、hashtags
- [ ] Worker 錯誤處理與重試機制
- [ ] WebSocket / SSE 即時進度通知
- [ ] 前端影片管理頁面：
  - [ ] 影片上傳元件（拖拉 + 進度條）
  - [ ] 影片列表（狀態標籤、篩選）
  - [ ] Clip 預覽介面（影片播放器 + 起止時間微調）
  - [ ] Clip 標題/描述編輯
  - [ ] 一鍵排程至多平台

### 1.5 社群平台連結
**檔案位置：** `apps/api/src/modules/user/`（社群帳號部分）

待開發：
- [ ] YouTube OAuth 2.0 整合（YouTube Data API v3）
- [ ] Instagram Graph API OAuth 整合
- [ ] OAuth token 加密存儲（AES-256-GCM）
- [ ] Token 自動刷新排程（cron job）
- [ ] 前端社群帳號連結管理 UI

### 1.6 排程發佈（基本版）
**檔案位置：** `apps/api/src/modules/post-scheduler/`

待開發：
- [ ] 建立貼文 API（手動 / 從 Clip 匯入）
- [ ] AI 貼文內容生成（GPT-4o）
- [ ] BullMQ delayed job 排程機制
- [ ] YouTube 影片上傳 API 整合
- [ ] Instagram Reels/貼文發佈 API 整合
- [ ] 發佈結果記錄（成功/失敗處理）
- [ ] 前端排程管理頁面：
  - [ ] 日曆視圖（月/週/日）
  - [ ] 貼文編輯器（多平台預覽）
  - [ ] 拖拉調整排程時間
  - [ ] AI 建議最佳發佈時間

### 1.7 Stripe 訂閱
**檔案位置：** `apps/api/src/modules/payment/`

待開發：
- [ ] Stripe Products + Prices 建立（Free, Starter, Pro, Business）
- [ ] Stripe Checkout Session 建立 API
- [ ] Stripe Webhook 處理（invoice.paid, subscription.updated, subscription.deleted）
- [ ] 用量追蹤邏輯（影片數、貼文數、Bot 訊息數）
- [ ] 用量超限檢查 Middleware
- [ ] 前端方案選擇 / 升級頁面
- [ ] 前端帳單管理（Stripe Customer Portal 整合）

### 1.8 儀表板首頁
**檔案位置：** `apps/web/app/(dashboard)/`

待開發：
- [ ] 後端 Dashboard API（聚合數據查詢）
- [ ] 前端儀表板總覽頁：
  - [ ] 關鍵指標卡片（粉絲數、觀看數、收入、互動率）
  - [ ] 趨勢圖表（Recharts）
  - [ ] 近期排程列表
  - [ ] 快捷操作按鈕

---

## Phase 2：社群變現（目標 6-8 週）

### 2.1 聯盟行銷追蹤
**檔案位置：** `apps/api/src/modules/affiliate/`

待開發：
- [ ] 追蹤短網址產生 API（`/r/{tracking_code}`）
- [ ] 短網址重導向服務（記錄 click event）
- [ ] 轉換回報 API（Postback / Webhook / 手動）
- [ ] 聯盟行銷儀表板 API
- [ ] 前端聯盟連結管理頁
- [ ] 前端轉換數據儀表板（點擊率、轉換率、收益）

### 2.2 知識庫 + RAG 顧問 Bot
**檔案位置：** `apps/api/src/modules/knowledge-base/`、`apps/api/src/modules/bot/`

待開發：
- [ ] 文件上傳處理（PDF、Markdown、文字）
- [ ] 文件切割（500 token/chunk, 100 token overlap）
- [ ] OpenAI Embedding API 向量化
- [ ] pgvector 存儲與相似搜索
- [ ] 影片逐字稿自動匯入知識庫
- [ ] RAG 對話引擎：
  - [ ] 訊息向量化 → Top-5 相似搜索
  - [ ] 組合 system prompt + context + history
  - [ ] LLM 串流回覆（SSE / WebSocket）
- [ ] Bot 設定 API（名稱、人設、系統提示、知識庫綁定）
- [ ] Bot 嵌入 Widget（iframe / JS SDK）
- [ ] 存取層級控制（免費/會員/付費）
- [ ] 按次計費邏輯
- [ ] 前端 Bot 設定頁面
- [ ] 前端 Bot 對話介面（串流回覆）
- [ ] 前端 Fan 入口頁

### 2.3 粉絲付費會員
**檔案位置：** `apps/api/src/modules/membership/`

待開發：
- [ ] 會員等級 CRUD API
- [ ] Stripe Connect Express 帳戶建立流程（Creator onboarding）
- [ ] Stripe Price 建立（對應會員等級）
- [ ] Stripe Checkout 訂閱購買
- [ ] Stripe Connect 自動分潤（平台 10-20%）
- [ ] Webhook 處理會員狀態變更
- [ ] 會員專屬內容存取控制
- [ ] 前端會員等級管理（Creator 端）
- [ ] 前端會員購買頁（Fan 端）
- [ ] 前端會員管理（Creator 檢視訂閱者列表）

### 2.4 更多平台整合
- [ ] TikTok Content Posting API 整合
- [ ] Facebook Graph API 整合
- [ ] 各平台互動數據定時拉取（cron job, 每 6 小時）

### 2.5 進階分析儀表板
**檔案位置：** `apps/api/src/modules/analytics/`

待開發：
- [ ] 各平台數據聚合 API
- [ ] 跨平台比較數據
- [ ] 收入分析（訂閱 + 會員 + 聯盟）
- [ ] 內容表現排行
- [ ] 前端進階圖表（多維度篩選、日期範圍）

---

## Phase 3：完整平台（目標 6-8 週）

### 3.1 AI 品牌合作企劃
**檔案位置：** `apps/api/src/modules/brand-deal/`

待開發：
- [ ] AI 提案生成（GPT-4o：Creator 數據 + 品牌需求 → 專業提案）
- [ ] 提案編輯器
- [ ] PDF 匯出（Puppeteer 或 react-pdf）
- [ ] 合作狀態追蹤（管線管理）
- [ ] 前端品牌合作管理頁面
- [ ] 前端提案編輯 + 預覽

### 3.2 白牌多租戶
**檔案位置：** `apps/api/src/modules/tenant/`

待開發：
- [ ] 租戶管理後台（Admin）
- [ ] 自訂域名支援（CNAME + SSL）
- [ ] 品牌客製化（Logo、色彩主題、樣式）
- [ ] 租戶級別的方案管理
- [ ] 白牌 API 存取（API Key 管理）
- [ ] 前端管理後台 `apps/web/app/(admin)/`

### 3.3 API 開放
- [ ] 第三方 API Key 簽發與管理
- [ ] Rate Limiting 策略（按方案）
- [ ] API 文件公開頁面（基於 Swagger）
- [ ] Webhook 回呼設定

### 3.4 行動端最佳化
- [ ] PWA 配置（manifest.json, service worker）
- [ ] 響應式 UI 全面適配
- [ ] 觸控手勢最佳化

### 3.5 其他平台整合
- [ ] Threads API 整合
- [ ] Twitter/X API v2 整合
- [ ] 進階 AI：自動最佳發佈時間、內容趨勢分析

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
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | Google Cloud Console |
| `YOUTUBE_CLIENT_ID/SECRET` | YouTube API | Google Cloud Console (啟用 YouTube Data API v3) |
| `INSTAGRAM_APP_ID/SECRET` | Instagram API | Meta Developer Portal |
| `AWS_*` | S3 + CloudFront | AWS IAM Console |

---

## 備註

- 所有模組的 service 目前為 stub（含 TODO 註解），需逐一實作 Prisma 查詢與業務邏輯
- Prisma Schema 已定義完成，執行 `pnpm db:push` 即可建表
- 前端使用 shadcn/ui，需透過 `npx shadcn@latest add <component>` 新增 UI 元件
- API 文件在 `http://localhost:4000/api/docs`（Swagger UI）
