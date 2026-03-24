---
name: spec
description: >
  為指定模組生成或更新技術規格文檔。包含 API 設計、資料模型、業務邏輯和測試案例。
  自動銜接 PRD 驗收條件確保無遺漏。
argument-hint: "<模組名稱>"
disable-model-invocation: true
---

# /spec — 技術規格文檔

為指定模組生成面向工程師的技術規格文檔。

## 使用方式
```
/spec $ARGUMENTS
```
其中 $ARGUMENTS 為模組名稱，例如：auth, video, membership-tier

## 執行步驟

### 1. 收集輸入資料
- 讀取 `specs/prd-$ARGUMENTS.md`（如果存在 PRD，以此為主要輸入）
- 讀取 `specs/_template.md` 取得規格文檔格式
- 讀取 `apps/api/prisma/schema.prisma` 找出相關 models 和 enums
- 讀取 `docs/DEVELOPMENT_PLAN.md` 取得該模組的待開發清單
- 讀取 `CLAUDE.md` 確認 API 設計規範、命名慣例
- 如果模組目錄已有代碼，讀取現有實作了解 API 端點和業務邏輯

### 2. 生成/更新 Spec
- 如果 `specs/` 下無對應 spec → 生成新文件（命名：`{phase}-$ARGUMENTS.md`）
- 如果已存在 → 基於現有內容更新（保留手動修改的部分）

### 3. Spec 內容要求

遵循 `specs/_template.md` 格式，包含：

- **概述**：模組用途與核心價值（中文）
- **依賴關係**：前置模組、共用元件、外部服務
- **Database Models**：引用 Prisma schema，列出相關欄位；如需新增/修改，列出完整 schema 變更
- **API Endpoints**：完整的 request/response TypeScript 型別，含認證需求和錯誤碼
- **Business Logic**：流程步驟 + 邊界條件
- **前端頁面**：路由、元件、狀態管理、API 呼叫對應
- **測試案例**：
  - Unit Tests（happy path + error cases）
  - E2E Tests（對應 PRD 驗收條件，以 `AC{N}:` 編號）

### 4. PRD 銜接檢查（如有 PRD）
- 逐條比對 PRD 驗收條件，確保每條都有對應的 API endpoint 或前端流程
- 未覆蓋的驗收條件標記為 `[待補]`
- 在 spec 頂部標注：`> PRD: specs/prd-{name}.md`

### 5. 品質檢查
- API 設計符合 RESTful 慣例和 CLAUDE.md 規範
- 路徑格式：`/api/v1/{module}/{resource}`
- 所有 endpoint 有明確的 TypeScript 型別
- 所有查詢包含 tenantId 過濾

### 6. 確認與銜接
- 顯示生成的 spec 摘要
- 提示：「技術 spec 已完成，你可以執行 `/implement $ARGUMENTS` 開始實作」

## 語言規範
- 描述性文字使用中文
- 技術細節（型別、API path、code blocks）使用英文
