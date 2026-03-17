根據規格文檔實作指定模組。

## 使用方式
```
/implement $ARGUMENTS
```
其中 $ARGUMENTS 為模組名稱，例如：auth, user, tenant, video, social, scheduler, payment, dashboard

## 執行步驟

1. **讀取規格文檔**：讀取 `specs/phase1-$ARGUMENTS.md` 取得完整規格
2. **讀取現有代碼**：檢查 `apps/api/src/modules/` 下對應模組目錄的現有 stub 代碼
3. **讀取依賴**：確認 spec 中列出的前置模組是否已實作（檢查 service 是否仍為 TODO stub）
4. **讀取 Prisma Schema**：讀取 `apps/api/prisma/schema.prisma` 確認相關 models
5. **確認 PrismaService 可用**：確認 `apps/api/src/prisma/` 下已有 PrismaModule
6. **實作後端**：按以下順序實作
   - DTOs（`dto/` 目錄，使用 class-validator 驗證）
   - Service（業務邏輯，注入 PrismaService）
   - Controller（HTTP 端點，使用 Swagger 裝飾器）
   - Module（匯入依賴模組）
   - Gateway（如需要 WebSocket）
7. **實作前端**（如 spec 中有定義前端頁面）：
   - 頁面元件（使用 shadcn/ui）
   - API 呼叫 hooks（SWR / fetch）
   - 表單驗證（Zod）
8. **執行 lint**：`pnpm lint` 確認代碼品質
9. **更新 DEVELOPMENT_PLAN.md**：將已完成的項目打勾 `[x]`

## 規範提醒
- 遵循 CLAUDE.md 中的命名慣例與模組結構
- API 路徑格式：`/api/v1/{module}/{resource}`
- 所有查詢必須包含 tenantId 過濾
- 使用 cursor-based 分頁
- 錯誤格式遵循 RFC 7807
- OAuth token 必須加密存儲（AES-256-GCM）
- 前端不得曝露 API key
