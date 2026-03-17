# Social Platform Connection — 規格文檔

> Phase: 1 | Priority: P0 | Status: draft

## 概述
社群平台連結模組負責管理創作者的社群帳號 OAuth 授權。支援 YouTube、Instagram、TikTok、Facebook、Twitter、Threads 等平台的連結與斷開，並自動維護 token 有效性，確保後續排程發佈與數據同步能正常運作。

## 依賴關係
- **前置模組**: Auth (1.1)、Database Setup (1.2)、User System (1.3)
- **使用的共用元件**: `JwtAuthGuard`, `TenantInterceptor`, `PrismaService`, `EncryptionService`
- **外部服務**: YouTube Data API v3 (Google OAuth 2.0)、Instagram Graph API (Facebook OAuth)、各平台 OAuth endpoints

## 相關檔案
```
apps/api/src/modules/user/
├── social/
│   ├── social.controller.ts      # OAuth redirect & callback endpoints
│   ├── social.service.ts         # OAuth flow + token management
│   ├── social.module.ts
│   ├── dto/
│   │   └── connect-social.dto.ts
│   ├── strategies/               # 各平台 OAuth 策略
│   │   ├── youtube.strategy.ts
│   │   ├── instagram.strategy.ts
│   │   └── base-oauth.strategy.ts
│   ├── encryption.service.ts     # AES-256-GCM token 加解密
│   └── __tests__/
│       ├── social.controller.spec.ts
│       ├── social.service.spec.ts
│       └── encryption.service.spec.ts

apps/api/src/workers/
└── token-refresh.cron.ts         # 定時刷新即將過期的 tokens
```

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `SocialAccount`
相關 Enums: `SocialPlatform`

### SocialAccount
```prisma
enum SocialPlatform {
  YOUTUBE
  INSTAGRAM
  TIKTOK
  FACEBOOK
  TWITTER
  THREADS
}

model SocialAccount {
  id                String          @id @default(cuid())
  userId            String
  tenantId          String
  platform          SocialPlatform
  platformUserId    String          // 平台端的 user/channel ID
  platformUsername   String          // 顯示名稱 (e.g., "@creator123")
  accessToken       String          @db.Text  // AES-256-GCM encrypted
  refreshToken      String?         @db.Text  // AES-256-GCM encrypted
  tokenExpiresAt    DateTime?       // access token 到期時間
  scopes            String[]        // 授權的 scope 列表
  followerCount     Int             @default(0)
  profileImageUrl   String?
  isActive          Boolean         @default(true)
  lastSyncedAt      DateTime?       // 最後一次同步 profile data
  lastRefreshedAt   DateTime?       // 最後一次 refresh token

  user              User            @relation(fields: [userId], references: [id])

  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@unique([userId, platform, platformUserId])  // 同平台同帳號不重複
  @@index([tenantId])
  @@index([userId])
  @@index([tokenExpiresAt])  // cron job 查詢即將過期 tokens
  @@map("social_accounts")
}
```

## API Endpoints

### `GET /api/v1/social/connect/:platform`
- **描述**: 發起 OAuth 授權流程，重導至平台授權頁面
- **認證**: Required
- **Path Parameters**: `platform` — `youtube` | `instagram` | `tiktok` | `facebook` | `twitter` | `threads`
- **Response** `302`: Redirect to platform OAuth consent page
- **Flow**:
  1. 生成 `state` token (JWT: `{ userId, tenantId, platform, nonce }`)，存入 Redis (TTL 10min)
  2. 組裝 OAuth authorize URL with required scopes
  3. 302 redirect to platform
- **Errors**: `400` unsupported platform / `401` unauthorized

**各平台 OAuth Scopes (MVP)**:
| Platform  | Scopes |
|-----------|--------|
| YouTube   | `youtube.upload`, `youtube.readonly`, `youtube.force-ssl` |
| Instagram | `instagram_basic`, `instagram_content_publish`, `pages_show_list` |

### `GET /api/v1/social/callback/:platform`
- **描述**: 處理 OAuth callback，交換 authorization code 取得 tokens
- **認證**: Via `state` parameter (contains JWT)
- **Query Parameters**:
```typescript
{
  code: string;     // authorization code from platform
  state: string;    // JWT state token
  error?: string;   // OAuth error (if denied)
}
```
- **Response** `302`: Redirect to `/dashboard/settings/social?connected={platform}`
- **Flow**:
  1. 驗證 `state` token (JWT 解碼 + Redis 存在性檢查 + 刪除防重放)
  2. 使用 `code` 向平台交換 access_token + refresh_token
  3. 呼叫平台 API 取得 user profile (platformUserId, username, followerCount, avatar)
  4. 加密 tokens (AES-256-GCM)
  5. Upsert `SocialAccount` record (若同 platform + platformUserId 已存在則更新)
  6. 302 redirect 回前端設定頁
- **Errors**:
  - `400` invalid state / expired state / OAuth error
  - `409` 此平台帳號已被其他使用者連結 → redirect with `?error=account_linked`

### `GET /api/v1/social/accounts`
- **描述**: 取得目前使用者連結的所有社群帳號
- **認證**: Required
- **Response** `200`:
```typescript
{
  data: {
    id: string;
    platform: SocialPlatform;
    platformUsername: string;
    platformUserId: string;
    profileImageUrl: string | null;
    followerCount: number;
    isActive: boolean;
    scopes: string[];
    lastSyncedAt: string | null;
    tokenStatus: "valid" | "expiring_soon" | "expired";  // computed field
    createdAt: string;
  }[];
}
```
- **注意**: 回傳不包含 `accessToken` / `refreshToken` (永遠不暴露至前端)

### `DELETE /api/v1/social/accounts/:id`
- **描述**: 斷開社群帳號連結
- **認證**: Required (must be account owner)
- **Response** `204`: no content
- **Flow**:
  1. 驗證 ownership (userId + tenantId)
  2. 嘗試 revoke platform token (best-effort, 不阻擋刪除)
  3. 刪除 `SocialAccount` record
  4. 取消該帳號相關的 pending scheduled posts (通知使用者)
- **Errors**: `404` account not found

### `POST /api/v1/social/accounts/:id/refresh`
- **描述**: 手動觸發 token 刷新 (通常由 cron job 自動處理)
- **認證**: Required (must be account owner)
- **Response** `200`:
```typescript
{
  id: string;
  tokenStatus: "valid";
  tokenExpiresAt: string;  // new expiry time
}
```
- **Errors**: `404` not found / `400` no refresh token available / `502` platform API error

## Business Logic

### OAuth Flow 完整流程
```
前端                        後端                         平台
  |                          |                           |
  |-- Click "Connect" ------>|                           |
  |                          |-- Generate state -------->|
  |<-- 302 Redirect ---------|        (save to Redis)    |
  |                          |                           |
  |-- User consents ---------------------------------->  |
  |                          |                           |
  |                          |<-- Callback (code+state) -|
  |                          |-- Verify state            |
  |                          |-- Exchange code → tokens  |
  |                          |-- Fetch profile           |
  |                          |-- Encrypt & save          |
  |<-- 302 to dashboard -----|                           |
```

**邊界條件**:
- 使用者拒絕授權 → callback 帶 `error=access_denied`，redirect 回前端 with error message
- State token 過期 (10min) → 要求重新發起 connect
- 同帳號重新連結 → upsert，更新 tokens，保留歷史 clips/posts 關聯
- Platform API 暫時不可用 → 502 error，提示稍後重試

### Token 加密存儲 (AES-256-GCM)
```typescript
// EncryptionService
class EncryptionService {
  private readonly key: Buffer; // from env: ENCRYPTION_KEY (32 bytes)

  encrypt(plaintext: string): string {
    // 1. Generate random 12-byte IV
    // 2. AES-256-GCM encrypt
    // 3. Return: base64(iv + authTag + ciphertext)
  }

  decrypt(encrypted: string): string {
    // 1. Decode base64
    // 2. Extract IV (12 bytes) + authTag (16 bytes) + ciphertext
    // 3. AES-256-GCM decrypt
    // 4. Return plaintext
  }
}
```

- `ENCRYPTION_KEY` 從環境變數讀取，不可硬編碼
- 每次加密使用隨機 IV，確保相同 token 加密後密文不同
- Key rotation: 支援 `ENCRYPTION_KEY_PREVIOUS` 用於漸進式 key 更換

**邊界條件**:
- `ENCRYPTION_KEY` 未設定 → 啟動時 throw error，不允許運行
- 解密失敗 (key 不符) → 標記 account 為 `isActive: false`，要求重新連結

### Token Auto-Refresh Cron Job
```typescript
// token-refresh.cron.ts — 每 30 分鐘執行
@Cron('*/30 * * * *')
async handleTokenRefresh() {
  // 1. 查詢 tokenExpiresAt < now + 1hr 且 isActive === true 的帳號
  // 2. 批量 refresh (concurrency limit: 5)
  // 3. 更新 accessToken, tokenExpiresAt, lastRefreshedAt
  // 4. Refresh 失敗 3 次連續 → isActive = false, 通知使用者
}
```

**各平台 Token 有效期**:
| Platform  | Access Token TTL | Refresh Token TTL | 備註 |
|-----------|------------------|--------------------|----|
| YouTube   | 1 hour           | No expiry (until revoked) | Google OAuth |
| Instagram | 1 hour (short-lived) → 60 days (long-lived) | N/A | 需交換 long-lived token |

**邊界條件**:
- Refresh token 過期 (Instagram long-lived 60 days) → `isActive: false`，通知使用者重新連結
- Platform API rate limit → exponential backoff，下次 cron 再試
- 並發 refresh 衝突 → Redis distributed lock per social account ID
- 多實例部署 → cron job 透過 Redis lock 確保只有一個實例執行

### Profile Sync
- 連結時同步: `platformUsername`, `followerCount`, `profileImageUrl`
- 每日定時同步 (daily cron): 更新 follower count 等動態數據
- `lastSyncedAt` 記錄最後同步時間

## 前端頁面

### 社群帳號管理頁 (`app/(dashboard)/settings/social/page.tsx`)
- **功能**: 檢視、連結、斷開社群帳號
- **元件**:
  - Platform cards grid — 每個支援平台一張卡片
    - 未連結: 平台 icon + "Connect" button
    - 已連結: avatar + username + follower count + status badge + "Disconnect" button
  - `Card` (shadcn/ui) — 平台卡片容器
  - `Avatar` — 平台頭像
  - `Badge` — connection status (`valid`=green, `expiring_soon`=yellow, `expired`=red)
  - `Button` — Connect / Disconnect
  - `AlertDialog` — 斷開連結確認 (提示: 排程中的貼文將受影響)
  - `Toaster` — 連結成功/失敗通知
- **狀態管理**: SWR (`useSWR('/api/v1/social/accounts')`)
- **Connect Flow**:
  1. 點擊 "Connect" → `window.location.href = '/api/v1/social/connect/{platform}'`
  2. OAuth 授權完成後 redirect 回此頁 with `?connected={platform}`
  3. 偵測 URL params → 顯示成功 toast → SWR revalidate
- **Error Handling**:
  - `?error=access_denied` → toast "您已取消授權"
  - `?error=account_linked` → toast "此帳號已被其他使用者連結"
  - `?error=server_error` → toast "連結失敗，請稍後再試"

## 測試案例

### Happy Path
- [ ] Connect YouTube: 完成 OAuth flow → SocialAccount created with encrypted tokens
- [ ] Connect Instagram: 完成 OAuth flow → short-lived token 自動交換為 long-lived token
- [ ] List accounts: 回傳所有連結帳號，不包含 token 欄位
- [ ] Disconnect: 刪除 SocialAccount，revoke platform token
- [ ] Manual refresh: 取得新的 access token，更新 expiresAt
- [ ] Auto-refresh cron: 到期前自動 refresh，帳號保持 active

### Edge Cases
- [ ] 使用者拒絕 OAuth 授權 → redirect with error message，不建立 record
- [ ] State token 過期 (10min) → 400 error，提示重新連結
- [ ] 重複連結同一帳號 → upsert tokens，不建立重複 record
- [ ] 同平台帳號已被其他使用者連結 → 409 error，提示帳號衝突
- [ ] Platform API 暫時不可用 → 502 error，不影響已儲存的 token
- [ ] Refresh token 失效 → `isActive: false`，前端顯示 "expired" badge
- [ ] 連續 3 次 refresh 失敗 → 停用帳號 + 通知使用者
- [ ] 加密 key rotation → 使用 `ENCRYPTION_KEY_PREVIOUS` 解密舊 token，重新加密
- [ ] 斷開帳號時有 pending scheduled posts → 提示使用者，取消相關排程

### Security
- [ ] Access token / refresh token 永遠不會出現在 API response 中
- [ ] Tokens 使用 AES-256-GCM 加密存儲，每次使用隨機 IV
- [ ] OAuth state parameter 防止 CSRF (JWT + Redis + nonce)
- [ ] State token 使用後立即從 Redis 刪除 (防重放攻擊)
- [ ] `ENCRYPTION_KEY` 未設定時服務拒絕啟動
- [ ] Callback endpoint 驗證 code + state 完整性
- [ ] Token refresh 使用 Redis distributed lock 防止並發衝突
- [ ] 前端 connect 使用 `window.location.href` 而非 AJAX (確保完整 redirect)
- [ ] SocialAccount 查詢強制 tenant isolation (`tenantId` filter)
