---
name: test
description: >
  為指定模組生成並執行單元測試。使用 Jest + ts-jest，覆蓋 Service 和 Controller 層。
  自動 mock 外部依賴，每個 public method 至少 happy path + error case。
argument-hint: "<模組名稱>"
disable-model-invocation: true
---

# /test — 單元測試

為指定模組生成並執行單元測試。

## 使用方式
```
/test $ARGUMENTS
```
其中 $ARGUMENTS 為模組名稱，例如：auth, user, membership-tier

## 執行步驟

### 1. 讀取模組資訊
- 讀取 `apps/api/src/modules/$ARGUMENTS/` 下所有檔案
- 讀取對應的 spec 文檔中「測試案例」段落
- 讀取對應的 PRD 文檔中「驗收條件」（如果存在）
- 確認模組的依賴關係（需要 mock 哪些 service）

### 2. 建立測試檔案
在 `apps/api/src/modules/$ARGUMENTS/__tests__/` 目錄下建立：
- `$ARGUMENTS.service.spec.ts` — Service 單元測試
- `$ARGUMENTS.controller.spec.ts` — Controller 單元測試（HTTP 層）

### 3. 測試規範
- 使用 Jest + ts-jest
- 使用 `@nestjs/testing` 的 `Test.createTestingModule`
- Mock 外部依賴（PrismaService, 外部 API clients, BullMQ queues）
- **不 Mock** 內部業務邏輯
- 每個 public method 至少覆蓋：happy path + 1 error case
- 使用 `describe` 分組、`it` 描述具體行為
- 測試描述使用英文（`it('should create user with hashed password')`）

### 4. 測試結構範例
```typescript
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockDeep<PrismaClient>() },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
  });

  describe('register', () => {
    it('should create user with hashed password', async () => { ... });
    it('should throw ConflictException for duplicate email', async () => { ... });
  });
});
```

### 5. 執行測試
```bash
pnpm --filter api test -- --testPathPattern=$ARGUMENTS
```

### 6. 結果處理
- **全部通過**：回報通過的測試數量和覆蓋的方法
- **有失敗**：分析失敗原因，修復測試或代碼後重跑（最多 3 次）
- 列出最終結果：通過/失敗/跳過數量

### 7. 銜接
- 「單元測試完成，建議執行 `/e2e $ARGUMENTS` 產生 E2E 測試」
