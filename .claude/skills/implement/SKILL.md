---
name: implement
description: >
  根據技術規格文檔實作指定模組。按順序完成 Prisma schema、DTOs、Service、Controller、Module 和前端頁面。
  自動檢查前置條件和依賴模組。
argument-hint: "<模組名稱>"
disable-model-invocation: true
---

# /implement — 模組實作

根據技術 spec 實作指定模組的完整代碼。

## 使用方式
```
/implement $ARGUMENTS
```
其中 $ARGUMENTS 為模組名稱，例如：auth, user, membership-tier

## 執行步驟

### 1. 讀取規格與確認前置條件
- 讀取 `specs/` 下對應的技術 spec（`phase*-$ARGUMENTS.md` 或 `*-$ARGUMENTS.md`）
- 讀取 `specs/prd-$ARGUMENTS.md`（如果存在，確認驗收條件）
- 讀取 `apps/api/prisma/schema.prisma` 確認相關 models
- 檢查 spec 中列出的前置模組是否已實作（service 是否仍為 TODO stub）
- 確認 `apps/api/src/prisma/` 下 PrismaModule 可用
- 如果前置條件未滿足，**警告使用者**並列出缺失項目

### 2. 實作後端（按順序）
1. **Prisma Schema**（如需修改）→ 執行 `pnpm db:push` + `pnpm db:generate`
2. **DTOs** (`dto/` 目錄) — class-validator 驗證裝飾器
3. **Service** — 業務邏輯，注入 PrismaService
4. **Controller** — HTTP 端點，Swagger 裝飾器 (@ApiTags, @ApiOperation, @ApiBearerAuth)
5. **Module** — 匯入依賴模組，匯出 Service
6. **Gateway**（如需要 WebSocket）

### 3. 實作前端（如 spec 中有定義）
1. **API 層** — TanStack Query hooks 或 fetch utils
2. **頁面元件** — 使用 shadcn/ui，遵循現有頁面風格
3. **表單驗證** — Zod schema
4. **狀態管理** — Zustand store（如需要跨頁面狀態）

### 4. 品質確認
- 執行 `pnpm lint` 確認代碼品質
- 檢查是否有 TypeScript 錯誤：`pnpm --filter api build`（dry run）
- 確認所有 API 路徑符合 `/api/v1/{module}/{resource}` 格式
- 確認所有查詢包含 tenantId 過濾

### 5. 更新追蹤文件
- 更新 `docs/DEVELOPMENT_PLAN.md`：將已完成項目打勾 `[x]`

### 6. 確認與銜接
- 列出所有建立/修改的檔案清單
- 提示：「實作完成，建議執行 `/review` 進行代碼審查」

## 規範提醒
- 遵循 CLAUDE.md 中的命名慣例與模組結構
- API 路徑格式：`/api/v1/{module}/{resource}`
- 所有查詢必須包含 tenantId 過濾
- 使用 cursor-based 分頁
- 錯誤格式遵循 RFC 7807
- OAuth token 必須加密存儲（AES-256-GCM）
- 前端不得曝露 API key
- 偏好編輯現有檔案而非建立新檔案
