# Creator Platform

一站式 AI 驅動創作者變現工具平台。整合影片剪輯、社群排程、知識庫 Bot、粉絲會員、品牌企劃、趨勢雷達、數位商品、Email 行銷等模組，幫助創作者從內容生產到變現的完整工作流。

## 功能模組

### 內容生產
- **影片管理** — 上傳、轉碼、AI 自動摘要與逐字稿（Whisper）
- **AI 智慧剪輯** — 從長影片自動生成短影片片段，AI 評分排序
- **內容蒐集** — Chrome 擴充功能一鍵收藏跨平台內容

### 社群經營
- **多平台社群連結** — YouTube、Instagram、TikTok、Facebook、Twitter/X、Threads OAuth 綁定
- **排程發佈** — AI 生成文案，多平台一鍵排程發佈
- **趨勢雷達** — 關鍵字監控、爆款內容偵測
- **數據分析** — 跨平台互動指標同步、收入報表

### 變現工具
- **粉絲會員** — 多階層訂閱制，Stripe 金流整合
- **品牌合作** — 業配 / 大使合約管理與追蹤
- **數位商品** — 商品上架、銷售與庫存管理
- **聯盟行銷** — 追蹤連結、傭金計算
- **Email 行銷** — 電子報發送與名單管理

### AI 智慧
- **知識庫** — 文件向量化（pgvector），語意搜尋
- **AI 聊天機器人** — 基於知識庫的自動客服 Bot
- **Landing Page** — 個人化銷售頁面建置

## 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| Monorepo | Turborepo + pnpm | 工作區管理 |
| 前端 | Next.js 14 (App Router) + TypeScript | React 全端框架 |
| UI | shadcn/ui + Tailwind CSS | 元件庫 + 樣式 |
| 狀態管理 | Zustand + TanStack Query | 客戶端 + 伺服器狀態 |
| 後端 | NestJS 10 | 模組化單體架構，23 個功能模組 |
| ORM | Prisma 5 | 型別安全資料存取 |
| 資料庫 | PostgreSQL 16 + pgvector | 關聯式 + 向量搜尋 |
| 快取/佇列 | Redis 7 + BullMQ | 任務佇列、快取 |
| AI | OpenAI (GPT-4o-mini + Whisper) | 內容生成、語音轉文字 |
| 影片處理 | FFmpeg + fluent-ffmpeg | 影片轉碼與剪輯 |
| 爬蟲 | Playwright | 趨勢內容抓取 |
| 認證 | Passport JWT | Access + Refresh Token |
| 支付 | Stripe (Subscriptions + Connect) | 訂閱 + 創作者分潤 |
| 檔案儲存 | AWS S3 + CloudFront | 上傳 + CDN 加速 |

## 專案結構

```
creator-platform/
├── apps/
│   ├── web/             # Next.js 前端 (port 3001)
│   ├── api/             # NestJS 後端 (port 4000)
│   └── extension/       # Chrome 擴充功能 (MV3)
├── packages/
│   ├── shared-types/    # 共用 TypeScript 型別
│   └── utils/           # 共用工具函式
├── infrastructure/      # Docker 與部署腳本
├── specs/               # 產品規格文件
├── docker-compose.yml   # PostgreSQL + Redis
└── turbo.json           # Turborepo 設定
```

## 快速開始

### 前置需求

- Node.js >= 18
- pnpm >= 9
- Docker & Docker Compose

### 安裝與啟動

```bash
# 1. Clone 專案
git clone <repo-url>
cd creator-platform

# 2. 安裝依賴
pnpm install

# 3. 啟動基礎設施（PostgreSQL + Redis）
docker compose up -d

# 4. 設定環境變數
cp .env.example .env
# 編輯 .env 填入必要的 API Key

# 5. 初始化資料庫
pnpm db:push
pnpm db:generate

# 6. 啟動開發伺服器
pnpm dev
```

啟動後：
- 前端：http://localhost:3001
- 後端 API：http://localhost:4000
- API 文件（Swagger）：http://localhost:4000/api/docs

### 個別啟動

```bash
pnpm --filter web dev       # 僅前端
pnpm --filter api dev       # 僅後端
```

## 環境變數

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `REDIS_URL` | Redis 連線字串 |
| `JWT_SECRET` | JWT 簽名金鑰 |
| `OPENAI_API_KEY` | OpenAI API 金鑰 |
| `STRIPE_SECRET_KEY` | Stripe 密鑰 |
| `STRIPE_PUBLISHABLE_KEY` | Stripe 公開金鑰 |
| `AWS_ACCESS_KEY_ID` | AWS 存取金鑰 |
| `AWS_S3_BUCKET` | S3 儲存桶名稱 |
| `GOOGLE_CLIENT_ID` / `SECRET` | Google OAuth |
| `YOUTUBE_CLIENT_ID` / `SECRET` | YouTube API |
| `INSTAGRAM_APP_ID` / `SECRET` | Instagram API |
| `FACEBOOK_APP_ID` / `SECRET` | Facebook API |
| `TIKTOK_CLIENT_KEY` / `SECRET` | TikTok API |
| `TWITTER_CLIENT_ID` / `SECRET` | Twitter/X API |

完整變數清單請參考 `.env.example`。

## 常用指令

```bash
pnpm dev              # 啟動所有開發伺服器
pnpm build            # 建置所有應用
pnpm lint             # 程式碼檢查
pnpm test             # 執行測試

# 資料庫
pnpm db:push          # 推送 Schema 到資料庫
pnpm db:generate      # 產生 Prisma Client
pnpm db:migrate       # 執行資料庫遷移
pnpm db:studio        # 開啟 Prisma Studio GUI
pnpm db:seed          # 填入測試資料
```

## 架構設計

### 後端模組（23 個）

**核心基礎**：Auth、User、Tenant（多租戶）、Payment

**內容生產**：Video、AI、Content Clip、Auto Browse、Short Video

**社群發佈**：Social、Post Scheduler、Analytics、Trend Radar

**變現工具**：Affiliate、Membership、Brand Deal、Digital Product、Email Marketing、Landing Page

**智慧服務**：Knowledge Base、Bot

**平台設施**：Dashboard、API Gateway

### 資料庫模型（16 個）

Tenant、User、SocialAccount、Video、VideoClip、Post、AffiliateLink、AffiliateEvent、KnowledgeBase、KnowledgeChunk、BotConfig、Conversation、MembershipTier、Membership、BrandDeal、PlatformAnalytics

### 關鍵設計決策

- **模組化單體**（非微服務）— 降低運維複雜度，未來可拆分
- **pgvector**（非 Pinecone）— 減少外部依賴，向量搜尋內建於 PostgreSQL
- **BullMQ 任務佇列** — 處理影片轉碼、排程發佈、AI 生成等非同步任務
- **Cursor-based 分頁** — 適合無限捲動 UI，效能優於 offset 分頁
- **多租戶隔離** — Prisma middleware 自動注入 tenantId

## License

Private — All rights reserved.
