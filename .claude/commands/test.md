為指定模組生成並執行單元測試。

## 使用方式
```
/test $ARGUMENTS
```
其中 $ARGUMENTS 為模組名稱，例如：auth, user, tenant, video, social, scheduler, payment, dashboard

## 執行步驟

1. **讀取模組代碼**：讀取 `apps/api/src/modules/$ARGUMENTS/` 下所有檔案
2. **讀取規格文檔**：讀取 `specs/phase1-$ARGUMENTS.md` 中的「測試案例」段落
3. **建立測試檔案**：在 `apps/api/src/modules/$ARGUMENTS/__tests__/` 目錄下建立測試
4. **測試結構**：
   - `$ARGUMENTS.service.spec.ts` — Service 單元測試
   - `$ARGUMENTS.controller.spec.ts` — Controller 單元測試（HTTP 層）
5. **測試規範**：
   - 使用 Jest + ts-jest
   - Mock 外部依賴（PrismaService, 外部 API clients）
   - 不 Mock 內部業務邏輯
   - 每個 public method 至少覆蓋：happy path + 1 error case
   - 使用 `describe` 分組、`it` 描述具體行為
   - 測試描述使用英文（`it('should create user with hashed password')`)
6. **執行測試**：`pnpm --filter api test -- --testPathPattern=$ARGUMENTS`
7. **回報結果**：列出通過/失敗的測試案例，如有失敗則修復

## 測試模式範例
```typescript
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
