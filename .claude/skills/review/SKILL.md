---
name: review
description: >
  檢查代碼品質、安全性與規範合規性。涵蓋命名、NestJS 規範、OWASP 安全、多租戶、型別安全、錯誤處理、效能共 7 個維度。
  可自動修復發現的問題。
argument-hint: "[檔案路徑或目錄]"
disable-model-invocation: true
---

# /review — 代碼審查

檢查代碼品質、安全性與規範合規性。

## 使用方式
```
/review
```
檢查目前 git staged/unstaged changes。或指定路徑：
```
/review $ARGUMENTS
```

## 執行步驟

### 1. 取得變更範圍
- 無參數：`git diff --name-only` + `git diff --cached --name-only` 取得所有變更檔案
- 有參數：檢查 $ARGUMENTS 指定的檔案或目錄
- 如果無任何變更，提示使用者並結束

### 2. 載入規範
- 讀取 `CLAUDE.md` 載入所有開發規範
- 如果變更涉及特定模組，讀取對應的 spec 和 PRD 文檔
- 讀取相關模組的現有代碼作為上下文

### 3. 逐檔檢查（7 個維度）

#### 命名規範 (CLAUDE.md)
- [ ] 檔案名稱 kebab-case
- [ ] 類別 PascalCase、函數 camelCase、常數 UPPER_SNAKE_CASE
- [ ] API 路徑 kebab-case

#### NestJS 規範
- [ ] 模組結構正確（module/controller/service/dto）
- [ ] DTOs 使用 class-validator 裝飾器
- [ ] Controller 使用 @ApiTags, @ApiOperation
- [ ] Service 注入 PrismaService 而非直接用 PrismaClient

#### 安全性 (OWASP Top 10)
- [ ] 無 SQL injection 風險（使用 Prisma 參數化查詢）
- [ ] 無 XSS 風險（前端輸入正確跳脫）
- [ ] 所有 API 有適當的認證/授權 guard
- [ ] 敏感資料（token, password）不出現在 log 或 response
- [ ] OAuth token 加密存儲
- [ ] 無硬編碼的 secret/API key

#### 多租戶
- [ ] 所有資料查詢包含 tenantId 過濾
- [ ] 無跨租戶資料洩漏風險

#### 型別安全
- [ ] 無 `any` 型別（除非有明確理由）
- [ ] Request/Response 有明確 DTO 型別
- [ ] Prisma 查詢結果正確型別化

#### 錯誤處理
- [ ] 使用 NestJS 內建 exceptions（NotFoundException, ConflictException 等）
- [ ] 錯誤訊息有意義且不洩漏內部實作

#### 效能
- [ ] 無 N+1 查詢（使用 Prisma include/select）
- [ ] 大量資料使用 cursor-based 分頁
- [ ] 適當使用 select 避免 over-fetching

#### Spec 合規（如有對應 spec）
- [ ] API endpoint 路徑與 spec 一致
- [ ] Request/Response 型別與 spec 一致
- [ ] 業務邏輯流程與 spec 一致

### 4. 輸出報告

```
## Review 報告

### Critical (X 項)
1. `file:line` — {問題描述}
   → 修復建議：{具體修改}

### Warning (X 項)
...

### Info (X 項)
...

### 總結
- 檔案數：X
- 問題總計：X (Critical: X, Warning: X, Info: X)
- 建議：{通過 / 需修復後再 review}
```

### 5. 自動修復（如使用者同意）
- 如有 Critical 或 Warning 問題，提問：「是否要自動修復這些問題？」
- 修復後重新執行 review 確認

### 6. 銜接
- 如果通過：「Review 通過，建議執行 `/test {module}` 產生並執行測試」
- 如果未通過：列出需手動處理的項目
