檢查代碼品質、安全性與規範合規性。

## 使用方式
```
/review
```
檢查目前 git staged changes，或指定路徑：
```
/review $ARGUMENTS
```

## 執行步驟

1. **取得變更範圍**：
   - 無參數：`git diff --cached --name-only` 取得 staged files
   - 有參數：檢查 $ARGUMENTS 指定的檔案或目錄
2. **讀取 CLAUDE.md**：載入所有開發規範
3. **讀取相關 spec**：如果變更涉及特定模組，讀取對應的 spec 文檔
4. **逐檔檢查**，針對以下維度評分：

### 檢查項目

**命名規範** (CLAUDE.md)
- [ ] 檔案名稱 kebab-case
- [ ] 類別 PascalCase、函數 camelCase、常數 UPPER_SNAKE_CASE
- [ ] API 路徑 kebab-case

**NestJS 規範**
- [ ] 模組結構正確（module/controller/service/dto）
- [ ] DTOs 使用 class-validator 裝飾器
- [ ] Controller 使用 @ApiTags, @ApiOperation
- [ ] Service 注入 PrismaService 而非直接用 PrismaClient

**安全性** (OWASP Top 10)
- [ ] 無 SQL injection 風險（使用 Prisma 參數化查詢）
- [ ] 無 XSS 風險（前端輸入正確跳脫）
- [ ] 所有 API 有適當的認證/授權 guard
- [ ] 敏感資料（token, password）不出現在 log 或 response
- [ ] OAuth token 加密存儲
- [ ] 無硬編碼的 secret/API key

**多租戶**
- [ ] 所有資料查詢包含 tenantId 過濾
- [ ] 無跨租戶資料洩漏風險

**型別安全**
- [ ] 無 `any` 型別（除非有明確理由）
- [ ] Request/Response 有明確 DTO 型別
- [ ] Prisma 查詢結果正確型別化

**錯誤處理**
- [ ] 使用 NestJS 內建 exceptions（NotFoundException, ConflictException 等）
- [ ] 錯誤訊息有意義且不洩漏內部實作

**效能**
- [ ] 無 N+1 查詢（使用 Prisma include/select）
- [ ] 大量資料使用 cursor-based 分頁
- [ ] 適當使用 select 避免 over-fetching

5. **輸出報告**：按嚴重程度分類
   - 🔴 **Critical**: 安全漏洞、資料洩漏
   - 🟡 **Warning**: 規範不符、效能問題
   - 🔵 **Info**: 建議改善項目
6. **提供修復建議**：對每個問題提供具體的修改建議
