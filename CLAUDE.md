# Creator Platform — 開發指南

## 專案概述
AI 驅動的創作者變現工具平台。整合影片剪輯、社群排程、知識庫 Bot、粉絲會員、品牌企劃、趨勢雷達、數位商品、Email 行銷等模組。

## 技術棧
- **Monorepo**: Turborepo + pnpm
- **前端**: Next.js 14 (App Router) + TypeScript + shadcn/ui + Tailwind CSS
- **後端**: NestJS — 模組化單體架構
- **資料庫**: PostgreSQL 16 + pgvector + Redis 7 (BullMQ)
- **ORM**: Prisma
- **AI**: OpenAI (GPT-4o-mini + Whisper)
- **影片處理**: FFmpeg + fluent-ffmpeg
- **爬蟲**: Playwright (headed mode)
- **認證**: JWT (access + refresh token)
- **支付**: Stripe (Subscriptions + Connect)

## 專案結構
```
apps/web/          # Next.js 前端 (port 3001)
apps/api/          # NestJS 後端 (port 4000)
apps/extension/    # Chrome 擴充功能
packages/          # 共用型別 + 工具
```

## 常用指令
```bash
pnpm --filter web dev       # 前端
pnpm --filter api dev       # 後端
pnpm db:push                # 推送 schema 到 DB
pnpm db:generate             # 產生 Prisma Client
docker compose up -d         # PostgreSQL + Redis
```

## 開發規範
- **檔案**: kebab-case / **類別**: PascalCase / **變數**: camelCase / **常數**: UPPER_SNAKE_CASE
- **API**: `/api/v1/{module}/{resource}`, Bearer JWT, cursor-based 分頁, RFC 7807 錯誤格式
- **模組結構**: `module.ts` + `controller.ts` + `service.ts` + `dto/`
- **Git**: Conventional Commits (`feat:`, `fix:`, `chore:`), 不提交 `.env`
- **安全**: 前端不曝露 API key, class-validator 驗證輸入, Stripe Elements 處理卡號
- **測試**: Jest + ts-jest, `*.spec.ts`, mock 外部依賴

## 關鍵設計決策
1. 模組化單體（非微服務）— 減少運維，未來可拆
2. pgvector（非 Pinecone）— 減少外部依賴
3. BullMQ — 影片處理、排程發佈、AI 生成
4. cursor-based 分頁 — 適合無限滾動

## 協作原則

### 內容品質
- 所有主張需有外部來源佐證，無法佐證標注「[待驗證]」
- 禁止順著使用者的話直接歸納為結論

### 批判性協作
- 使用者論點缺乏依據時應主動指出，而非附和
- 有不同意見需明確提出並說明理由
- 區分「使用者原創主張」與「有外部佐證的論點」

### 引用與知識累積
- 核心主張對應外部參考，文末列出來源
- CLAUDE.md 為活文件，隨專案演進更新

### 產出責任
- 產出供使用者審查，不應誤導為可直接使用
- 提升品質上限，而非加速輸出數量
