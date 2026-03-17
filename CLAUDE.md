# Creator Platform — 開發指南

## 專案概述
AI 驅動的創作者變現工具平台。整合影片剪輯、社群排程、知識庫顧問 Bot、粉絲會員、品牌企劃五大模組。

## 技術棧
- **Monorepo**: Turborepo + pnpm
- **前端**: Next.js 14+ (App Router) + TypeScript + shadcn/ui + Tailwind CSS
- **後端**: NestJS (TypeScript) — 模組化單體架構
- **ORM**: Prisma
- **資料庫**: PostgreSQL 16 + pgvector + Redis 7
- **任務佇列**: BullMQ (Redis-based)
- **認證**: Auth.js + JWT
- **支付**: Stripe (Subscriptions + Connect)
- **AI**: OpenAI (Whisper + GPT-4o + Embeddings)
- **存儲**: AWS S3 + CloudFront
- **部署**: Vercel (前端) + AWS ECS Fargate (後端)

## 專案結構
```
creator-platform/
├── apps/
│   ├── web/                # Next.js 前端 (port 3000)
│   │   └── app/            # App Router: (auth), (dashboard), (fan), (admin)
│   └── api/                # NestJS 後端 (port 4000)
│       ├── src/modules/    # 業務模組 (auth, video, post-scheduler, etc.)
│       ├── src/common/     # Guards, Interceptors, Filters, Decorators
│       ├── src/config/     # Config module
│       ├── src/workers/    # BullMQ worker processors
│       └── prisma/         # Schema + migrations
├── packages/
│   ├── shared-types/       # 跨 app 共用 TypeScript 型別
│   └── utils/              # 共用工具函數
└── infrastructure/         # Docker, IaC scripts
```

## 常用指令
```bash
pnpm dev                    # 啟動所有 apps (前後端)
pnpm build                  # 建構所有 apps
pnpm lint                   # 檢查所有 apps
pnpm test                   # 執行所有測試

# 資料庫
pnpm db:generate            # 產生 Prisma Client
pnpm db:migrate             # 執行資料庫遷移
pnpm db:push                # 推送 schema 到 DB (開發用)
pnpm db:studio              # 開啟 Prisma Studio

# 單一 app
pnpm --filter web dev       # 只啟動前端
pnpm --filter api dev       # 只啟動後端
```

## 開發規範

### 命名慣例
- **檔案**: kebab-case (`video-processing.worker.ts`, `create-post.dto.ts`)
- **類別**: PascalCase (`VideoService`, `CreatePostDto`)
- **函數/變數**: camelCase (`processVideo`, `clipDuration`)
- **常數**: UPPER_SNAKE_CASE (`MAX_VIDEO_SIZE`, `DEFAULT_CHUNK_SIZE`)
- **資料庫表**: snake_case (由 Prisma 自動對應)
- **API 路徑**: kebab-case (`/api/v1/video-clips`)

### NestJS 模組結構
每個業務模組遵循以下結構：
```
modules/video/
├── video.module.ts          # 模組定義
├── video.controller.ts      # HTTP 端點
├── video.service.ts         # 業務邏輯
├── video.gateway.ts         # WebSocket (如需要)
├── dto/                     # 資料傳輸物件
│   ├── create-video.dto.ts
│   └── update-video.dto.ts
├── entities/                # Prisma 對應的型別擴展
└── __tests__/               # 單元測試
```

### 前端結構
```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (dashboard)/
│   ├── layout.tsx           # Creator 儀表板框架
│   ├── page.tsx             # 總覽頁
│   ├── videos/page.tsx      # 影片管理
│   ├── posts/page.tsx       # 排程管理
│   ├── bot/page.tsx         # Bot 設定
│   ├── members/page.tsx     # 會員管理
│   ├── deals/page.tsx       # 品牌合作
│   └── analytics/page.tsx   # 數據分析
├── (fan)/                   # 粉絲入口 (Bot 對話、會員購買)
└── (admin)/                 # 平台管理後台
```

### API 設計規範
- 路徑格式: `/api/v1/{module}/{resource}`
- 認證: Bearer Token (JWT)
- 分頁: cursor-based (`?cursor=xxx&limit=20`)
- 錯誤格式: RFC 7807 Problem Details
- 所有 API 必須驗證 tenant context

### 多租戶
- 所有資料表含 `tenantId` 欄位
- Prisma middleware 自動注入 tenant 過濾
- PostgreSQL RLS 作為第二層防護
- 從 JWT 解析 tenant context

### 安全要求
- OAuth token 加密存儲 (AES-256-GCM)
- 前端不得曝露任何 API key
- 所有輸入使用 Zod (前端) / class-validator (後端) 驗證
- Stripe Elements 處理卡號，卡號不經自有伺服器

### Git 規範
- 分支: `feature/xxx`, `fix/xxx`, `refactor/xxx`
- Commit: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- PR 必須通過 CI (lint + test + build)

### 環境變數
- 所有環境變數定義在 `.env.example`
- 敏感資訊不得提交 (使用 `.gitignore`)
- 各環境使用獨立配置 (dev / staging / prod)

## 關鍵設計決策
1. **模組化單體** 而非微服務 — 減少運維成本，模組間用 EventEmitter 通訊，未來可拆分
2. **pgvector** 而非 Pinecone — 減少外部依賴，MVP 階段足夠
3. **BullMQ** 處理所有非同步任務 — 影片處理、排程發佈、AI 生成
4. **Stripe Connect Express** — Creator 收款自動拆帳，平台抽成
5. **cursor-based 分頁** — 適合無限滾動 UI、效能優於 offset

## 測試規範
- **框架**: Jest + ts-jest
- **命名**: `*.spec.ts`（放在各模組 `__tests__/` 目錄）
- **模式**: 每個 service/controller 一個測試檔
- **Mock**: Mock 外部依賴（Prisma, 外部 API），不 Mock 內部邏輯
- **覆蓋率**: 每個 public method 至少覆蓋 happy path + 1 error case
- **描述**: 測試描述使用英文 `it('should do something')`
- **執行**: `pnpm test` 或 `pnpm --filter api test -- --testPathPattern=<module>`

## 錯誤處理
- **後端**: 使用 NestJS 內建 exceptions（`NotFoundException`, `ConflictException`, `ForbiddenException`）
- **全域 Filter**: `HttpExceptionFilter` 統一格式為 RFC 7807 Problem Details
- **前端**: 使用 React Error Boundary 包裹路由級別元件
- **API 錯誤回應格式**:
```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Video not found",
  "instance": "/api/v1/videos/xxx"
}
```

## Spec 驅動開發流程
1. **寫 Spec** → `/spec <module>` 生成規格文檔至 `specs/`
2. **Review** → 確認 API 設計、資料模型、邊界條件
3. **Implement** → `/implement <module>` 根據 spec 實作
4. **Test** → `/test <module>` 生成並執行測試
5. **Review** → `/review` 檢查代碼品質
6. **PR** → 建立 Pull Request

### 自訂 Commands
- `/implement <module>` — 根據 spec 實作指定模組
- `/test <module>` — 生成並執行模組測試
- `/spec <module>` — 生成或更新規格文檔
- `/review` — 檢查代碼品質與規範合規性

### 規格文檔位置
- `specs/_template.md` — 規格模板
- `specs/phase1-*.md` — Phase 1 各模組規格

## MVP Phase 1 範圍
- 使用者系統 (註冊/登入/OAuth)
- 儀表板骨架
- 影片上傳 + AI 剪輯流程
- 基本排程發佈 (YouTube + Instagram)
- Stripe 訂閱 (Free + Pro)
