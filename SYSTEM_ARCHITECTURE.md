# Creator Platform — 系統架構文檔

> 最後更新：2026-03-23

---

## 1. 架構總覽

本平台採用 **模組化單體架構（Modular Monolith）**，以 Turborepo + pnpm Monorepo 管理多個應用與共用套件。短期內享有單體的部署簡易性，長期可依模組邊界拆分為微服務。

> **框架區分：** 前端使用 **Next.js**（React 全端框架），後端使用 **NestJS**（Node.js 後端框架）。兩者名稱相似但為完全不同的框架，前後端透過 REST API 通信。

```
┌──────────────────────────────────────────────────────────────────┐
│                        Creator Platform                          │
├──────────────────┬────────────────┬─────────────┬───────────────┤
│ apps/web         │ apps/api       │ apps/       │ packages/     │
│ 【前端】Next.js  │ 【後端】NestJS │ extension/  │ shared-types/ │
│ React (port 3001)│ Node.js (4000) │ Chrome MV3  │ + utils/      │
└────┬─────────────┴────┬───────────┴──────┬──────┴───────────────┘
     │                  │                  │
     │    REST API (/api/v1/*, JWT)        │  Content Script
     │                  │                  │
     │    ┌─────────────▼──────────────────────────────┐
     │    │     【後端】NestJS (Node.js 框架)            │
     │    │  ┌───────────────────────────────────────┐  │
     │    │  │  23 Feature Modules (see §3)          │  │
     │    │  └───────────────────────────────────────┘  │
     │    │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
     │    │  │ Prisma   │ │ BullMQ   │ │ OpenAI API │  │
     │    │  │ ORM      │ │ Workers  │ │ GPT/Whisper│  │
     │    │  └────┬─────┘ └────┬─────┘ └────────────┘  │
     │    └───────┼────────────┼────────────────────────┘
     │            │            │
┌────▼────┐ ┌────▼────┐ ┌────▼────┐  ┌──────────┐  ┌─────────┐
│ Browser │ │ PG 16   │ │ Redis 7 │  │ AWS S3   │  │ Stripe  │
│ Client  │ │+pgvector│ │ (Queue) │  │+CloudFront│  │ Connect │
└─────────┘ └─────────┘ └─────────┘  └──────────┘  └─────────┘
```

---

## 2. 技術棧明細

| 層級 | 技術 | 版本 | 用途 |
|------|------|------|------|
| **Monorepo** | Turborepo + pnpm | 9.x | 工作區管理、任務編排 |
| **前端框架** | Next.js (App Router) — React 全端框架 | 14 | SSR/SSG、路由、中間件 |
| **前端 UI** | shadcn/ui + Tailwind CSS | 3.4 | 組件庫、樣式系統 |
| **前端狀態** | Zustand + TanStack Query | 5.x | 客戶端狀態 + 伺服器快取 |
| **前端表單** | React Hook Form + Zod | — | 表單驗證 |
| **前端圖表** | Recharts | 2.15 | 數據可視化 |
| **後端框架** | NestJS — Node.js 後端框架（非 Next.js） | 10.4 | 模組化框架、DI、守衛 |
| **ORM** | Prisma | 5.18 | 型別安全資料存取 |
| **資料庫** | PostgreSQL + pgvector | 16 | 關聯式 + 向量檢索 |
| **快取/佇列** | Redis + BullMQ | 7 | 任務佇列、排程 |
| **AI** | OpenAI (GPT-4o-mini + Whisper) | — | 內容生成、語音轉文字 |
| **影片** | FFmpeg + fluent-ffmpeg | — | 影片裁切、轉碼 |
| **爬蟲** | Playwright (headed) | — | 社群內容擷取 |
| **認證** | Passport-JWT | — | Access + Refresh Token |
| **支付** | Stripe SDK | — | 訂閱、Connect 分潤 |
| **檔案** | AWS S3 + CloudFront | — | 上傳、CDN 分發 |
| **容器** | Docker Compose | — | 本地 PG + Redis |

---

## 3. 後端模組架構

每個模組遵循 NestJS（後端框架）慣例：`module.ts` → `controller.ts` → `service.ts` → `dto/`

### 3.1 核心基礎模組

| 模組 | 路徑 | 職責 |
|------|------|------|
| **Auth** | `modules/auth/` | JWT 註冊/登入/刷新、Passport Strategy、Guards |
| **User** | `modules/user/` | 個人資料 CRUD、Onboarding 流程 |
| **Tenant** | `modules/tenant/` | 多租戶管理、Prisma Middleware 自動 tenant 隔離 |
| **Payment** | `modules/payment/` | Stripe Checkout、Customer Portal、Webhook、方案限制 |
| **Dashboard** | `modules/dashboard/` | 總覽指標、近期活動彙整 |

### 3.2 內容生產模組

| 模組 | 路徑 | 職責 |
|------|------|------|
| **Video** | `modules/video/` | 影片上傳（S3 Presigned）、處理佇列、AI 剪輯 |
| **AI** | `modules/ai/` | OpenAI 封裝、內容生成、Whisper 轉錄 |
| **Content Clip** | `modules/content-clip/` | 內容探索、跨平台蒐集 |
| **Auto Browse** | `modules/auto-browse/` | Playwright 爬蟲（Dcard、Threads、TikTok） |
| **Short Video** | `modules/short-video/` | 短影音工具（TikTok/Shorts 格式） |

### 3.3 社群分發模組

| 模組 | 路徑 | 職責 |
|------|------|------|
| **Social** | `modules/social/` | 6 平台 OAuth 連接、Token 加密、同步 |
| **Post Scheduler** | `modules/post-scheduler/` | 排程發佈、AI 文案、多平台一鍵發佈 |
| **Analytics** | `modules/analytics/` | 社群數據同步、互動率、營收報表 |
| **Trend Radar** | `modules/trend-radar/` | 關鍵字監控、熱門內容偵測 |

### 3.4 變現模組

| 模組 | 路徑 | 職責 |
|------|------|------|
| **Membership** | `modules/membership/` | 粉絲會員階層、Stripe 訂閱扣款 |
| **Digital Product** | `modules/digital-product/` | 數位商品上架、訂單、下載 |
| **Affiliate** | `modules/affiliate/` | 聯盟行銷連結、點擊/轉換追蹤 |
| **Brand Deal** | `modules/brand-deal/` | 品牌合作管理、AI 提案生成 |
| **Landing Page** | `modules/landing-page/` | 自訂到達頁、SEO、CTA |
| **Email Marketing** | `modules/email-marketing/` | 訂閱者管理、序列信、開信追蹤 |

### 3.5 智能互動模組

| 模組 | 路徑 | 職責 |
|------|------|------|
| **Knowledge Base** | `modules/knowledge-base/` | 文件/URL 匯入、向量嵌入（pgvector）、RAG |
| **Bot** | `modules/bot/` | AI 聊天機器人、知識庫整合、分層存取 |

### 3.6 平台管理模組

| 模組 | 路徑 | 職責 |
|------|------|------|
| **API Gateway** | `modules/api-gateway/` | 第三方 API Key 管理、Webhook 管理 |

---

## 4. 資料架構

### 4.1 資料庫 ER 概覽

```
Tenant (1)──(N) User
  │                 │
  ├─(N) SocialAccount ──(N) PlatformAnalytics
  ├─(N) Video ──(N) VideoClip ──(N) Post
  ├─(N) Post
  ├─(N) AffiliateLink ──(N) AffiliateEvent
  ├─(N) KnowledgeBase ──(N) KnowledgeChunk [vector(1536)]
  ├─(N) BotConfig ──(N) Conversation
  ├─(N) MembershipTier ──(N) Membership
  ├─(N) BrandDeal
  ├─(N) Subscription
  ├─(N) ContentClip
  ├─(N) LandingPage
  ├─(N) DigitalProduct ──(N) ProductOrder
  ├─(N) EmailSubscriber
  └─(N) EmailCampaign ──(N) EmailTemplate
```

- **24 個資料模型**、**18 個列舉型別**
- 所有業務資料皆以 `tenant_id` 進行列級隔離
- 主鍵統一使用 UUID v4
- 向量欄位使用 pgvector `vector(1536)` 搭配 OpenAI text-embedding

### 4.2 多租戶隔離策略

```
Request → JwtAuthGuard → TenantGuard → Controller
                                          │
                              Prisma Client Extension
                              自動注入 WHERE tenant_id = ?
```

- Prisma Client Extension 在 query 層自動附加 `tenant_id` 過濾
- `@CurrentTenant()` / `@CurrentUser()` 裝飾器注入上下文
- 未來可升級為 PostgreSQL Row-Level Security (RLS)

---

## 5. 認證與授權

```
┌──────────────┐  POST /auth/register   ┌──────────────┐
│【前端】       │ ◄── JWT (15min) ─────►│【後端】        │
│ Next.js      │  POST /auth/login      │ NestJS       │
│ (React App)  │ ◄── Refresh (7d) ────►│ Auth Module  │
└──────────────┘  POST /auth/refresh    └──────────────┘
```

| 機制 | 說明 |
|------|------|
| Access Token | JWT、15 分鐘過期、包含 userId + tenantId |
| Refresh Token | 7 天過期、可撤銷 |
| 密碼雜湊 | bcrypt 12 rounds |
| 路由保護 | `JwtAuthGuard` 全域套用、`@Public()` 裝飾器豁免 |
| OAuth | Google OAuth（規劃中，前端 NextAuth.js） |
| Token 加密 | 社群平台 OAuth Token 使用 AES 加密存儲 |

---

## 6. 非同步任務架構

```
┌──────────┐     BullMQ      ┌──────────────────┐
│ API      │ ──── enqueue ──►│ Redis Queue       │
│ Service  │                  │                   │
└──────────┘                  └────────┬──────────┘
                                       │ dequeue
                              ┌────────▼──────────┐
                              │ Worker Processors  │
                              │ (post-publish,     │
                              │  video-processing) │
                              └────────────────────┘
```

### 佇列清單

| 佇列名稱 | 用途 | 觸發方式 |
|-----------|------|----------|
| `post-publish` | 排程貼文發佈至各社群平台 | Cron / scheduledAt 時間到達 |
| `video-processing` | 影片轉碼、Whisper 轉錄、AI 剪輯 | 上傳完成事件 |

---

## 7. 外部服務整合

```
┌─────────────────────────────────────────────────┐
│                  NestJS Backend                   │
├─────────┬──────────┬──────────┬─────────────────┤
│ Social  │ Payment  │ Storage  │ AI              │
│ Module  │ Module   │ (S3)     │ Module          │
└────┬────┴────┬─────┴────┬─────┴────┬────────────┘
     │         │          │          │
┌────▼───┐ ┌──▼────┐ ┌───▼───┐ ┌───▼──────┐
│YouTube │ │Stripe │ │AWS S3 │ │OpenAI    │
│IG/TikTok│ │Connect│ │+CDN   │ │GPT-4o    │
│FB/X/   │ │       │ │       │ │Whisper   │
│Threads │ │       │ │       │ │Embeddings│
└────────┘ └───────┘ └───────┘ └──────────┘
```

| 服務 | 用途 | 整合方式 |
|------|------|----------|
| **YouTube API** | OAuth、影片上傳、數據同步 | REST API + OAuth 2.0 |
| **Instagram Graph API** | 貼文發佈、數據同步 | REST API + OAuth |
| **TikTok API** | 影片上傳、數據同步 | REST API + OAuth |
| **Facebook Graph API** | 貼文發佈 | REST API + OAuth |
| **Twitter/X API** | 貼文發佈 | REST API + OAuth 2.0 |
| **Threads API** | 貼文發佈 | REST API + OAuth |
| **Stripe** | 平台訂閱、創作者 Connect 分潤、Webhook | Stripe SDK |
| **AWS S3** | 影片/檔案上傳、Presigned URL | AWS SDK |
| **CloudFront** | CDN 分發 | AWS |
| **OpenAI** | GPT-4o-mini 文案、Whisper 轉錄、Embedding | REST API |
| **Playwright** | Dcard / Threads / TikTok 內容爬取 | Headed Browser |

---

## 8. 前端架構（Next.js — React 框架）

### 8.1 路由結構（Next.js App Router）

```
app/
├── (auth)/           # 未登入 — 無側邊欄佈局
│   ├── login/
│   └── register/
├── (dashboard)/      # 已登入 — 含側邊欄佈局
│   ├── page.tsx          # 總覽
│   ├── videos/           # 影片庫
│   ├── clips/            # AI 剪輯
│   ├── schedule/         # 排程發佈
│   ├── analytics/        # 數據分析
│   ├── bot/              # AI 聊天機器人
│   ├── members/          # 粉絲會員
│   ├── brand/            # 品牌合作
│   ├── email/            # Email 行銷
│   ├── store/            # 數位商品
│   ├── landing/          # 到達頁
│   ├── browse/           # 內容探索
│   ├── trends/           # 趨勢雷達
│   └── settings/         # 設定
└── p/[slug]/         # 公開到達頁（SSR）
```

### 8.2 狀態管理策略

| 類型 | 方案 | 用途 |
|------|------|------|
| 伺服器狀態 | TanStack Query | API 資料快取、自動重新獲取 |
| 客戶端狀態 | Zustand | Auth Token、UI 狀態 |
| 表單狀態 | React Hook Form + Zod | 驗證、提交 |

### 8.3 API 通信層

```typescript
// lib/api.ts — 統一 HTTP Client
fetch(url, {
  headers: { Authorization: `Bearer ${accessToken}` },
  ...options,
})
```

- 自動附加 JWT Authorization Header
- Token 過期時自動 Refresh
- Next.js（前端）Middleware 處理未登入重導向

---

## 9. Chrome 擴充功能

- **Manifest V3** 架構
- Content Script 注入社群平台（YouTube、IG、FB、Threads、Dcard、X）
- 一鍵收藏內容至平台
- AI 自動摘要與分類
- Background Service Worker 處理 API 通信

---

## 10. 基礎設施與部署

### 10.1 本地開發

```bash
docker compose up -d       # PostgreSQL 16 (5433) + Redis 7 (6379)
pnpm db:push               # 同步 Schema
pnpm dev                   # Turborepo 並行啟動前後端
```

### 10.2 Docker 配置

| 服務 | 映像 | Port |
|------|------|------|
| PostgreSQL 16 | postgres:16 + pgvector | 5433 |
| Redis 7 | redis:7 | 6379 |
| API（規劃） | node:20-alpine | 4000 |

### 10.3 環境變數分類

| 分類 | 變數 |
|------|------|
| 資料庫 | `DATABASE_URL`, `REDIS_URL` |
| 認證 | `JWT_SECRET`, `NEXTAUTH_SECRET` |
| OAuth | `GOOGLE_CLIENT_*`, `YOUTUBE_CLIENT_*`, `INSTAGRAM_APP_*`, `FACEBOOK_APP_*`, `TIKTOK_CLIENT_*`, `TWITTER_CLIENT_*` |
| AI | `OPENAI_API_KEY` |
| 支付 | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| 儲存 | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DOMAIN` |
| URL | `API_URL`, `WEB_URL`, `NEXTAUTH_URL` |

---

## 11. 橫切關注點

### 11.1 API 設計慣例

| 項目 | 規範 |
|------|------|
| 路徑 | `/api/v1/{module}/{resource}` |
| 認證 | Bearer JWT |
| 分頁 | Cursor-based（`cursor` + `limit`）, `hasMore` flag |
| 錯誤格式 | RFC 7807 Problem Details |
| 驗證 | class-validator + class-transformer |
| 文件 | Swagger（NestJS 內建） |

### 11.2 錯誤處理

```
HttpExceptionFilter → RFC 7807 JSON
{
  "type": "https://api.example.com/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Video with id xxx not found"
}
```

### 11.3 安全措施

- Helmet — HTTP 安全標頭
- CORS — 白名單 origin
- bcrypt 12 rounds — 密碼雜湊
- AES 加密 — 社群平台 OAuth Token
- class-validator — 所有輸入驗證
- Ownership 檢查 — Service 層驗證資源歸屬
- Stripe Elements — 卡號不經後端
- 前端不曝露 API Key

---

## 12. 關鍵設計決策與權衡

| 決策 | 選擇 | 替代方案 | 理由 |
|------|------|----------|------|
| 架構風格 | 模組化單體 | 微服務 | 降低運維複雜度，未來可沿模組邊界拆分 |
| 向量資料庫 | pgvector | Pinecone / Weaviate | 減少外部依賴，與主資料庫同部署 |
| 任務佇列 | BullMQ (Redis) | RabbitMQ / SQS | 輕量、與 NestJS 整合良好 |
| 分頁策略 | Cursor-based | Offset-based | 適合無限滾動場景，大資料集效能穩定 |
| 多租戶隔離 | Prisma Middleware | RLS / Schema-per-tenant | 實作簡單，未來可漸進升級為 RLS |
| 前端框架 | Next.js App Router | Pages Router / SPA | SSR 支援（公開到達頁 SEO）+ Server Components |
| 狀態管理 | Zustand + TanStack Query | Redux / SWR | 輕量、職責分離清楚 |
