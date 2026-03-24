---
name: e2e
description: >
  為指定模組生成並執行 Playwright E2E 測試。基於 PRD 驗收條件產生測試案例，
  測試名稱以 AC{N}: 開頭直接對應驗收條件。包含環境自動設定。
argument-hint: "<模組名稱>"
disable-model-invocation: true
---

# /e2e — E2E 測試

為指定模組生成並執行 Playwright E2E 測試。

## 使用方式
```
/e2e $ARGUMENTS
```
其中 $ARGUMENTS 為模組名稱，例如：auth, membership-tier

## 前置條件檢查
1. 確認 Playwright 已安裝：檢查 `apps/web/package.json` 是否有 `@playwright/test`
2. 確認 `apps/web/playwright.config.ts` 存在
3. 如果不存在，執行「首次設定」

## 首次設定（自動）

安裝依賴：
```bash
cd apps/web && pnpm add -D @playwright/test && npx playwright install chromium
```

建立 `apps/web/playwright.config.ts`：
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter api dev',
      port: 4000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter web dev',
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

在 `apps/web/package.json` 加入 scripts：
```json
{ "test:e2e": "playwright test", "test:e2e:ui": "playwright test --ui" }
```

## 執行步驟

### 1. 讀取測試需求
- 讀取 `specs/prd-$ARGUMENTS.md` 的驗收條件（Given/When/Then）
- 讀取對應技術 spec 中的「E2E Tests」段落
- 讀取前端頁面代碼了解實際路由和 DOM 結構

### 2. 建立 E2E 測試
在 `apps/web/e2e/` 目錄下建立 `$ARGUMENTS.spec.ts`

### 3. 測試結構
```typescript
import { test, expect } from '@playwright/test';

test.describe('模組名稱', () => {
  test.beforeEach(async ({ page }) => {
    // 登入或其他前置操作
  });

  test('AC1: should {驗收條件描述}', async ({ page }) => {
    // Given
    await page.goto('/route');
    // When
    await page.getByRole('button', { name: 'Submit' }).click();
    // Then
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

### 4. 測試規範
- 每個 PRD 驗收條件對應至少 1 個 E2E test
- 測試名稱以 `AC{N}:` 開頭，對應 PRD 的驗收條件編號
- Locator 優先順序：`getByRole` > `getByText` > `getByLabel` > `getByTestId`
- 每個測試獨立，不依賴其他測試的狀態
- 長流程測試使用 `test.step` 標記步驟

### 5. 共用 Fixtures
如需要登入等共用操作，建立 `apps/web/e2e/fixtures/auth.ts`：
```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL('/dashboard');
    await use(page);
  },
});
```

### 6. 執行測試
```bash
cd apps/web && pnpm test:e2e -- --grep "$ARGUMENTS"
```

### 7. 結果處理
- **全部通過**：回報數量和涵蓋的驗收條件
- **有失敗**：分析是測試問題還是功能 bug，測試問題自動修復，功能 bug 標記
- 重跑（最多 3 次）

### 8. 完成輸出
```
## E2E 測試報告 — {模組名稱}
- 測試檔案：apps/web/e2e/$ARGUMENTS.spec.ts
- 總測試數：X
- 通過：X | 失敗：X
- PRD 驗收條件覆蓋率：X/Y (Z%)
- 未覆蓋的驗收條件：{list}
```
