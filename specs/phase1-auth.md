# Authentication Module (1.1) — 規格文檔

> Phase: 1 | Priority: P0 | Status: draft

## 概述
認證模組是整個平台的基礎，負責使用者註冊、登入、Token 管理與 Google OAuth 整合。註冊時自動建立預設 Tenant，實現多租戶架構的起點。前端使用 Next.js App Router 搭配 Auth.js 管理 session，後端使用 Passport + JWT 策略驗證所有受保護的 API。

## 依賴關係
- **前置模組**: 無（此模組為 Phase 1 第一個模組）
- **使用的共用元件**: `JwtAuthGuard`, `TenantGuard`, `@CurrentUser()` decorator, `PrismaService`, `HttpExceptionFilter`
- **外部服務**: Google OAuth 2.0 (via Auth.js on frontend, passport-google-oauth20 on backend)
- **NPM Dependencies**: `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `passport-local`, `bcrypt`, `class-validator`, `class-transformer`

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `User`, `Tenant`
相關 Enums: `UserRole`, `TenantPlan`

### User — 認證相關欄位
| Field | Type | 說明 |
|---|---|---|
| `id` | UUID | Primary key |
| `tenantId` | UUID | FK → Tenant，註冊時自動建立 |
| `email` | VARCHAR(255) | 登入識別，tenant 內唯一 (`@@unique([tenantId, email])`) |
| `passwordHash` | VARCHAR(255)? | bcrypt hash，OAuth 使用者可為 null |
| `displayName` | VARCHAR(255) | 顯示名稱 |
| `role` | UserRole | 預設 `CREATOR` |
| `locale` | VARCHAR(10) | 預設 `zh-TW` |
| `onboardingCompleted` | Boolean | 預設 `false` |

### Tenant — 註冊時自動建立
| Field | Type | 說明 |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | 預設為 User.displayName |
| `slug` | VARCHAR(100) | 自動由 displayName 生成，unique |
| `plan` | TenantPlan | 預設 `FREE` |

### Refresh Token 儲存策略
目前 schema 未定義獨立的 RefreshToken model。建議方案：

**方案 A（推薦）**: 新增 `RefreshToken` model
```prisma
model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  token     String   @unique @db.VarChar(500)
  expiresAt DateTime @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
  @@map("refresh_tokens")
}
```

**方案 B**: 使用 Redis 儲存 refresh token（key: `refresh:{userId}:{tokenId}`，TTL 7 天）

## API Endpoints

### `POST /api/v1/auth/register`
- **描述**: 註冊新使用者，同時建立預設 Tenant
- **認證**: Public（需加 `@Public()` decorator）
- **Request Body**:
```typescript
// CreateUserDto (class-validator)
{
  email: string;        // @IsEmail()
  password: string;     // @MinLength(8), @MaxLength(72), @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  displayName: string;  // @IsString(), @MinLength(2), @MaxLength(50)
}
```
- **Response** `201`:
```typescript
{
  accessToken: string;   // JWT, expires 15m
  refreshToken: string;  // opaque token, expires 7d
  user: {
    id: string;
    email: string;
    displayName: string;
    tenantId: string;
    role: UserRole;
    onboardingCompleted: boolean;
  }
}
```
- **Errors**:
  - `409 Conflict` — email 已被註冊
  - `400 Bad Request` — validation 失敗

### `POST /api/v1/auth/login`
- **描述**: Email + password 登入
- **認證**: Public
- **Request Body**:
```typescript
// LoginDto
{
  email: string;     // @IsEmail()
  password: string;  // @IsString(), @IsNotEmpty()
}
```
- **Response** `200`:
```typescript
{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    tenantId: string;
    role: UserRole;
    onboardingCompleted: boolean;
  }
}
```
- **Errors**:
  - `401 Unauthorized` — email 不存在或密碼錯誤（統一錯誤訊息，防止 enumeration attack）

### `POST /api/v1/auth/refresh`
- **描述**: 使用 refresh token 換取新的 token pair
- **認證**: Public
- **Request Body**:
```typescript
{
  refreshToken: string; // @IsString(), @IsNotEmpty()
}
```
- **Response** `200`:
```typescript
{
  accessToken: string;   // new JWT
  refreshToken: string;  // new refresh token (rotation)
}
```
- **Errors**:
  - `401 Unauthorized` — token 無效、已過期或已被撤銷

### `POST /api/v1/auth/logout`
- **描述**: 撤銷目前的 refresh token
- **認證**: Required (Bearer Token)
- **Request Body**:
```typescript
{
  refreshToken: string; // @IsString(), @IsNotEmpty()
}
```
- **Response** `200`:
```typescript
{
  message: "Logged out successfully"
}
```

### `GET /api/v1/auth/google`
- **描述**: 啟動 Google OAuth flow，redirect 到 Google consent page
- **認證**: Public
- **Response**: `302 Redirect` → Google OAuth URL

### `GET /api/v1/auth/google/callback`
- **描述**: Google OAuth callback，處理授權碼並建立/關聯使用者
- **認證**: Public
- **Query Params**: `code`, `state`
- **Response**: `302 Redirect` → frontend `/auth/callback?accessToken=...&refreshToken=...`

## Business Logic

### 註冊流程
1. 驗證 DTO（email 格式、密碼強度、displayName 長度）
2. 檢查 email 是否已存在（跨所有 tenant 查詢）
3. 使用 `bcrypt.hash(password, 12)` 加密密碼（cost factor = 12）
4. 生成 tenant slug（`slugify(displayName)` + random suffix if duplicate）
5. 在 transaction 中同時建立 Tenant + User：
   ```
   prisma.$transaction([
     prisma.tenant.create({ name: displayName, slug, plan: FREE }),
     prisma.user.create({ tenantId, email, passwordHash, displayName, role: CREATOR })
   ])
   ```
6. 簽發 JWT access token（15 分鐘）+ refresh token（7 天）
7. 回傳 token pair + user info

### 登入流程
1. 驗證 DTO
2. 透過 email 查詢 User（包含 passwordHash）
3. 使用 `bcrypt.compare(password, passwordHash)` 驗證密碼
4. 若驗證失敗，回傳統一錯誤訊息 `Invalid email or password`（防止 user enumeration）
5. 簽發 JWT access token + refresh token
6. 回傳 token pair + user info

### JWT Token 策略
- **Access Token**: JWT, 15 分鐘過期
  - Payload: `{ sub: userId, email, tenantId, role }`
  - Signing: HS256, secret from `JWT_SECRET` env var
- **Refresh Token**: opaque UUID (or signed JWT with 7d expiry)
  - 儲存於 DB 或 Redis
  - 支援 token rotation（每次 refresh 後舊 token 失效）
  - 支援 revocation（logout 時標記 `revokedAt`）

### Google OAuth 流程
1. Frontend 使用 Auth.js (NextAuth) 啟動 Google sign-in
2. Auth.js callback 取得 Google profile (email, name, picture)
3. Frontend 將 Google ID token 傳送到 `POST /api/v1/auth/google/callback`
4. Backend 驗證 Google ID token
5. 查詢是否已有相同 email 的 User：
   - 有 → 直接簽發 token pair
   - 無 → 自動建立 Tenant + User（`passwordHash = null`）
6. 回傳 token pair

### JWT 驗證策略 (Passport)
```typescript
// jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    // 查詢 user 是否存在且未被停用
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role };
  }
}
```

### JwtAuthGuard 行為
- 全域啟用（`APP_GUARD`），所有 route 預設需要 JWT
- 使用 `Reflector` 檢查 `@Public()` metadata，標記為 public 的 route 跳過驗證
- 現有實作位於 `apps/api/src/common/guards/jwt-auth.guard.ts`

**邊界條件**:
- email 大小寫 → 統一轉 lowercase 儲存
- password 長度上限 72 bytes（bcrypt 限制）→ 前端 + 後端同時限制 `@MaxLength(72)`
- 同時多次 refresh 相同 token → 只有第一次成功，後續回傳 401（防止 token reuse attack）
- OAuth 使用者嘗試密碼登入 → 回傳 `Please use Google sign-in`

## 前端頁面

### 登入頁面 (`app/(auth)/login/page.tsx`)
- **功能**: Email + 密碼登入，Google OAuth 按鈕
- **元件**: `Card`, `Input`, `Button`, `Label`, `Separator` (shadcn/ui)
- **狀態管理**: React Hook Form + Zod validation (local state)
- **流程**:
  1. 表單驗證 (email format, password required)
  2. Call `POST /api/v1/auth/login`
  3. 成功 → 儲存 token 到 `httpOnly cookie` 或 `localStorage`，redirect to `/dashboard`
  4. 失敗 → 顯示 inline error message
- **Google 登入**: 點擊 "Sign in with Google" → 觸發 Auth.js signIn('google')
- **連結**: "還沒有帳號？" → link to `/register`

### 註冊頁面 (`app/(auth)/register/page.tsx`)
- **功能**: Email + 密碼 + 顯示名稱註冊
- **元件**: `Card`, `Input`, `Button`, `Label`, `Separator` (shadcn/ui)
- **狀態管理**: React Hook Form + Zod validation (local state)
- **Validation Rules**:
  - email: valid email format
  - password: min 8 chars, 至少一個大寫、一個小寫、一個數字
  - displayName: 2-50 chars
- **流程**:
  1. 表單驗證
  2. Call `POST /api/v1/auth/register`
  3. 成功 → 儲存 token，redirect to `/dashboard` (or onboarding page)
  4. 失敗 → 顯示 error（如 email 已註冊）
- **Google 註冊**: 同登入頁 Google OAuth flow
- **連結**: "已有帳號？" → link to `/login`

### Auth Layout (`app/(auth)/layout.tsx`)
- **功能**: 共用的認證頁面 layout，置中 Card，品牌 logo
- **元件**: 簡潔背景 + centered container

### Token 管理 (Frontend)
- **儲存**: `accessToken` 儲存於 memory (React context)，`refreshToken` 儲存於 `httpOnly cookie`
- **Axios Interceptor**: 自動附加 `Authorization: Bearer {accessToken}` header
- **Token Refresh**: 當收到 401 response 時，自動呼叫 `/auth/refresh` 取得新 token pair
- **Logout**: 清除 tokens + call `/auth/logout`

## 需要建立的檔案

### Backend (`apps/api/src/modules/auth/`)
| 檔案 | 說明 |
|---|---|
| `dto/register.dto.ts` | RegisterDto with class-validator |
| `dto/login.dto.ts` | LoginDto with class-validator |
| `dto/refresh-token.dto.ts` | RefreshTokenDto |
| `strategies/jwt.strategy.ts` | Passport JWT strategy |
| `strategies/google.strategy.ts` | Passport Google OAuth strategy |
| `decorators/public.decorator.ts` | `@Public()` metadata decorator |
| `auth.service.ts` | 實作所有 TODO stubs |
| `auth.controller.ts` | 新增 logout, Google OAuth endpoints |
| `auth.module.ts` | 註冊 JwtModule, PassportModule, strategies |
| `__tests__/auth.service.spec.ts` | Unit tests |
| `__tests__/auth.controller.spec.ts` | Controller integration tests |

### Frontend (`apps/web/app/(auth)/`)
| 檔案 | 說明 |
|---|---|
| `login/page.tsx` | 登入頁面 |
| `register/page.tsx` | 註冊頁面 |
| `layout.tsx` | Auth layout |
| `callback/page.tsx` | OAuth callback handler |

## 測試案例

### Happy Path
- [ ] 使用有效 email + password 註冊，回傳 token pair + user info
- [ ] 註冊後自動建立 Tenant，slug 正確生成
- [ ] 使用正確 credentials 登入，回傳 token pair
- [ ] Access token 包含正確的 JWT payload (sub, email, tenantId, role)
- [ ] 使用有效 refresh token 換取新 token pair
- [ ] Refresh token rotation：舊 token 使用後失效
- [ ] Logout 成功撤銷 refresh token
- [ ] Google OAuth 新使用者自動建立帳號
- [ ] Google OAuth 已存在使用者直接登入
- [ ] `@Public()` decorator 標記的 route 不需要 JWT

### Edge Cases
- [ ] 註冊已存在的 email → 409 Conflict
- [ ] 密碼不符合強度要求 → 400 Bad Request with details
- [ ] 使用空字串或超長 displayName → validation error
- [ ] 同時用相同 email 註冊（race condition）→ 只有一個成功
- [ ] Refresh token 過期 → 401 Unauthorized
- [ ] 使用已撤銷的 refresh token → 401 Unauthorized
- [ ] 同一 refresh token 使用兩次 → 第二次 401（token rotation）
- [ ] OAuth 使用者嘗試 password login（passwordHash = null）→ 提示使用 Google 登入
- [ ] Tenant slug 衝突時自動加 suffix

### Security
- [ ] Password 以 bcrypt hash 儲存，明文不會出現在 DB 或 log
- [ ] JWT secret 從環境變數讀取，不 hardcode
- [ ] Login 失敗不透露是 email 不存在還是密碼錯誤（防 enumeration）
- [ ] Access token 過期時間 <= 15 分鐘
- [ ] Refresh token 支援 revocation
- [ ] Rate limiting on login/register endpoints（5 req/min per IP）
- [ ] Input sanitization 防止 SQL injection（Prisma 已處理）
- [ ] Google OAuth state parameter 驗證（防 CSRF）
- [ ] Response 不回傳 passwordHash 欄位
