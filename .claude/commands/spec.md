為指定模組生成或更新規格文檔。

## 使用方式
```
/spec $ARGUMENTS
```
其中 $ARGUMENTS 為模組名稱或 phase 編號，例如：auth, video, phase2-affiliate

## 執行步驟

1. **讀取模板**：讀取 `specs/_template.md` 取得規格文檔格式
2. **讀取 Prisma Schema**：讀取 `apps/api/prisma/schema.prisma` 找出相關 models 和 enums
3. **讀取開發計畫**：讀取 `DEVELOPMENT_PLAN.md` 取得該模組的待開發清單
4. **讀取現有代碼**：如果模組目錄已有代碼，讀取現有實作了解 API 端點和業務邏輯
5. **讀取 CLAUDE.md**：確認 API 設計規範、命名慣例
6. **生成/更新 spec**：
   - 如果 `specs/phase{N}-$ARGUMENTS.md` 不存在 → 生成新文件
   - 如果已存在 → 基於現有內容更新（保留手動修改的部分）
7. **Spec 內容要求**：
   - 模組概述（中文）
   - 依賴關係（列出前置模組和外部服務）
   - Database Models（引用 Prisma schema，列出相關欄位）
   - API Endpoints（完整的 request/response TypeScript 型別）
   - Business Logic（流程步驟 + 邊界條件）
   - 前端頁面需求（路由、元件、狀態管理）
   - 測試案例清單（happy path + edge cases + security）
8. **輸出確認**：顯示生成的 spec 摘要

## 語言規範
- 描述性文字使用中文
- 技術細節（型別、API path、code blocks）使用英文
- 遵循 specs/_template.md 的格式
