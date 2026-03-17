# User Management Module (1.2) — 規格文檔

> Phase: 1 | Priority: P0 | Status: draft

## 概述
使用者管理模組負責個人資料的查詢與更新、Onboarding 流程、以及社群帳號的連結管理。此模組依賴 Auth 模組的 JWT 驗證，所有 endpoint 需要已認證的使用者。Onboarding 流程引導新註冊的 Creator 完成角色設定與首次社群帳號綁定。

## 依賴關係
- **前置模組**: Authentication (1.1) — 需要 JWT 驗證與 `@CurrentUser()` decorator
- **使用的共用元件**: `JwtAuthGuard` (global), `TenantGuard`, `@CurrentUser()`, `@CurrentTenant()`, `PrismaService`
- **外部服務**: 無（社群帳號 OAuth 在各平台模組處理，此模組僅管理已連結的帳號記錄）

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `User`, `SocialAccount`
相關 Enums: `UserRole`, `SocialPlatform`

### User — 完整欄位
| Field | Type | 說明 |
|---|---|---|
| `id` | UUID | Primary key |
| `tenantId` | UUID | FK → Tenant |
| `email` | VARCHAR(255) | 不可更改（登入識別） |
| `passwordHash` | VARCHAR(255)? | 不在 API response 中回傳 |
| `displayName` | VARCHAR(255) | 可更新 |
| `avatarUrl` | String? | 頭像 URL (S3 or external) |
| `role` | UserRole | `CREATOR` / `ADMIN` / `AGENCY_MANAGER` / `FAN` |
| `locale` | VARCHAR(10) | 語系偏好，預設 `zh-TW` |
| `timezone` | VARCHAR(50)? | IANA timezone (e.g. `Asia/Taipei`) |
| `stripeCustomerId` | VARCHAR(255)? | Stripe 付款身份 |
| `stripeConnectId` | VARCHAR(255)? | Stripe Connect 收款身份 |
| `onboardingCompleted` | Boolean | 標記 onboarding 是否完成 |
| `createdAt` | DateTime | 建立時間 |
| `updatedAt` | DateTime | 更新時間 |

### SocialAccount
| Field | Type | 說明 |
|---|---|---|
| `id` | UUID | Primary key |
| `userId` | UUID | FK → User |
| `tenantId` | UUID | FK → Tenant |
| `platform` | SocialPlatform | `YOUTUBE` / `INSTAGRAM` / `TIKTOK` / ... |
| `platformUserId` | VARCHAR(255) | 平台上的 user ID |
| `platformUsername` | VARCHAR(255) | 平台上的 username/handle |
| `accessToken` | String | 加密儲存 (AES-256-GCM) |
| `refreshToken` | String? | 加密儲存 |
| `tokenExpiresAt` | DateTime? | Token 過期時間 |
| `scopes` | String[] | 授權範圍 |
| `followerCount` | Int? | 粉絲數（定期同步） |
| `isActive` | Boolean | 是否啟用 |
| `lastSyncedAt` | DateTime? | 最後同步時間 |

**Unique constraint**: `@@unique([userId, platform, platformUserId])` — 同一使用者同一平台不可重複綁定同一帳號

## API Endpoints

### `GET /api/v1/users/me`
- **描述**: 取得目前登入使用者的完整 profile
- **認證**: Required
- **Response** `200`:
```typescript
{
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  locale: string;
  timezone: string | null;
  onboardingCompleted: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
  // 不包含: passwordHash, stripeCustomerId, stripeConnectId
}
```
- **Errors**: `401 Unauthorized`

### `PATCH /api/v1/users/me`
- **描述**: 更新目前使用者的個人資料（部分更新）
- **認證**: Required
- **Request Body**:
```typescript
// UpdateProfileDto (class-validator, all fields optional)
{
  displayName?: string;  // @IsOptional(), @IsString(), @MinLength(2), @MaxLength(50)
  avatarUrl?: string;    // @IsOptional(), @IsUrl()
  locale?: string;       // @IsOptional(), @IsIn(['zh-TW', 'zh-CN', 'en', 'ja'])
  timezone?: string;     // @IsOptional(), @IsTimezone() (custom validator, IANA format)
}
```
- **Response** `200`:
```typescript
{
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string | null;
  updatedAt: string;
}
```
- **Errors**:
  - `400 Bad Request` — validation 失敗
  - `401 Unauthorized`

### `POST /api/v1/users/me/onboarding`
- **描述**: 完成 onboarding 流程，設定角色與可選的社群帳號資訊
- **認證**: Required
- **Request Body**:
```typescript
// CompleteOnboardingDto
{
  role?: UserRole;           // @IsOptional(), @IsEnum(UserRole)
  displayName?: string;      // @IsOptional(), @IsString(), @MinLength(2)
  timezone?: string;         // @IsOptional(), @IsTimezone()
  socialPlatforms?: SocialPlatform[];  // @IsOptional(), @IsArray() — 使用者想連結的平台（引導用，實際 OAuth 在後續步驟）
}
```
- **Response** `200`:
```typescript
{
  id: string;
  displayName: string;
  role: UserRole;
  onboardingCompleted: true;
  updatedAt: string;
}
```
- **Errors**:
  - `400 Bad Request` — validation 失敗
  - `409 Conflict` — onboarding 已完成（`onboardingCompleted = true`）

### `GET /api/v1/users/me/social-accounts`
- **描述**: 列出目前使用者已連結的所有社群帳號
- **認證**: Required
- **Response** `200`:
```typescript
{
  data: Array<{
    id: string;
    platform: SocialPlatform;
    platformUsername: string;
    followerCount: number | null;
    isActive: boolean;
    lastSyncedAt: string | null;
    scopes: string[];
    // 不包含: accessToken, refreshToken, tokenExpiresAt
  }>
}
```

### `DELETE /api/v1/users/me/social-accounts/:id`
- **描述**: 斷開指定的社群帳號連結
- **認證**: Required
- **Response** `200`:
```typescript
{
  message: "Social account disconnected"
}
```
- **Errors**:
  - `404 Not Found` — 帳號不存在或不屬於此使用者
  - `403 Forbidden` — 帳號屬於其他 tenant

## Business Logic

### 取得使用者 Profile
1. 從 `@CurrentUser()` 取得 user ID
2. 使用 `prisma.user.findUnique({ where: { id } })` 查詢
3. 使用 `select` 排除敏感欄位（`passwordHash`, `stripeCustomerId`, `stripeConnectId`）
4. 回傳 user profile

### 更新使用者 Profile
1. 從 `@CurrentUser()` 取得 user ID
2. 驗證 DTO
3. 使用 `prisma.user.update()` 更新允許的欄位
4. 不允許更新的欄位：`email`, `passwordHash`, `role`, `tenantId`, `onboardingCompleted`（各有專屬流程）
5. 回傳更新後的 user

### Onboarding 流程
1. 從 `@CurrentUser()` 取得 user ID
2. 檢查 `onboardingCompleted === false`，若已完成回傳 409
3. 更新 user profile（role, displayName, timezone）
4. 設定 `onboardingCompleted = true`
5. 回傳更新後的 user

**邊界條件**:
- 重複呼叫 onboarding → 409 Conflict
- avatarUrl 非合法 URL → 400
- 不支援的 locale → 400（限制為 `zh-TW`, `zh-CN`, `en`, `ja`）
- timezone 非 IANA 格式 → 400
- `displayName` 含特殊字元 → 允許（Unicode friendly），但 trim whitespace

### Social Account 安全處理
- `accessToken` 和 `refreshToken` 在寫入 DB 前使用 AES-256-GCM 加密
- API response 絕不回傳 token 相關欄位
- 斷開連結時：刪除 DB record（hard delete），而非 soft delete

## 前端頁面

### 個人設定頁面 (`app/(dashboard)/settings/page.tsx`)
- **功能**: 檢視和編輯個人資料、管理已連結的社群帳號
- **元件**: `Card`, `Input`, `Button`, `Label`, `Avatar`, `Select`, `Separator`, `Badge`, `AlertDialog` (shadcn/ui)
- **狀態管理**: SWR (`useSWR('/api/v1/users/me')`) + React Hook Form for edit mode

**UI 區塊**:

1. **Profile Section**
   - Avatar 顯示 + 上傳按鈕（上傳到 S3，取得 URL 後 PATCH）
   - displayName input（editable）
   - email display（read-only, greyed out）
   - locale select dropdown
   - timezone select dropdown（searchable, IANA timezone list）
   - "Save Changes" button

2. **Connected Accounts Section**
   - 列表顯示已連結的社群帳號（platform icon + username + follower count + status badge）
   - 每個帳號有 "Disconnect" button（觸發 AlertDialog 確認）
   - "Connect New Account" button（link to 各平台 OAuth flow）

3. **Account Section**
   - "Change Password" button（展開 inline form: current password + new password + confirm）
   - "Delete Account" button（danger zone, AlertDialog 確認）

### Onboarding 頁面 (`app/(dashboard)/onboarding/page.tsx`)
- **功能**: 首次登入引導，步驟式 wizard
- **元件**: `Card`, `Button`, `RadioGroup`, `Select`, `Progress` (shadcn/ui)
- **步驟**:
  1. **歡迎** — 簡介平台功能
  2. **角色選擇** — Creator / Agency Manager
  3. **基本設定** — displayName 確認、timezone 選擇
  4. **社群連結**（可跳過）— 引導連結 YouTube / Instagram
  5. **完成** — Call `POST /api/v1/users/me/onboarding`，redirect to `/dashboard`
- **狀態管理**: local state (step index, form data)
- **路由守衛**: middleware 檢查 `onboardingCompleted`，未完成則 redirect to `/dashboard/onboarding`

## 需要建立的檔案

### Backend (`apps/api/src/modules/user/`)
| 檔案 | 說明 |
|---|---|
| `dto/update-profile.dto.ts` | UpdateProfileDto with class-validator |
| `dto/complete-onboarding.dto.ts` | CompleteOnboardingDto |
| `user.service.ts` | 實作所有 TODO stubs，加入 Prisma 查詢 |
| `user.controller.ts` | 加入 `@CurrentUser()`, onboarding, social-accounts endpoints |
| `user.module.ts` | 註冊 PrismaService |
| `__tests__/user.service.spec.ts` | Unit tests |
| `__tests__/user.controller.spec.ts` | Controller tests |

### Frontend
| 檔案 | 說明 |
|---|---|
| `app/(dashboard)/settings/page.tsx` | 個人設定頁面 |
| `app/(dashboard)/onboarding/page.tsx` | Onboarding wizard |

## 測試案例

### Happy Path
- [ ] `GET /users/me` 回傳正確的使用者 profile
- [ ] `GET /users/me` response 不包含 `passwordHash`
- [ ] `PATCH /users/me` 成功更新 displayName
- [ ] `PATCH /users/me` 成功更新 locale 和 timezone
- [ ] `PATCH /users/me` 部分更新（只傳 displayName，其他欄位不變）
- [ ] `POST /users/me/onboarding` 設定 role + timezone，`onboardingCompleted` 變為 true
- [ ] `GET /users/me/social-accounts` 回傳已連結帳號列表
- [ ] `GET /users/me/social-accounts` response 不包含 accessToken/refreshToken
- [ ] `DELETE /users/me/social-accounts/:id` 成功斷開連結

### Edge Cases
- [ ] `PATCH /users/me` 嘗試更新 email → 被忽略或 400
- [ ] `PATCH /users/me` 嘗試更新 role → 被忽略或 400
- [ ] `PATCH /users/me` 空 body → 200 但無任何變更
- [ ] `POST /users/me/onboarding` 重複呼叫 → 409 Conflict
- [ ] `DELETE /users/me/social-accounts/:id` 使用不存在的 ID → 404
- [ ] `DELETE /users/me/social-accounts/:id` 使用其他使用者的帳號 ID → 403 或 404
- [ ] `PATCH /users/me` 帶 invalid timezone (e.g. `Mars/Olympus`) → 400
- [ ] `PATCH /users/me` displayName 只有空白字元 → 400
- [ ] 未完成 onboarding 的使用者訪問 dashboard → redirect to onboarding

### Security
- [ ] 所有 endpoints 未帶 JWT → 401 Unauthorized
- [ ] 使用者只能存取自己的 profile（無法查看其他使用者）
- [ ] Social account tokens 在 DB 中加密儲存
- [ ] API response 永遠不回傳 `passwordHash`, `accessToken`, `refreshToken` 等敏感欄位
- [ ] Tenant isolation：使用者只能看到自己 tenant 的 social accounts
- [ ] `@CurrentUser()` decorator 從 JWT payload 取值，非從 request body
