# Phase A: YouTube API 整合實作計畫

## 目標
打通完整路徑：連結 YouTube → 同步數據 → 排程發佈影片/短片到 YouTube

## 前置準備（需要你手動操作）

在開始寫 code 之前，你需要先到 Google Cloud Console 建立專案並取得 API 憑證：

1. 前往 https://console.cloud.google.com/ 建立新專案（或用現有的）
2. 啟用以下 API：
   - **YouTube Data API v3**
3. 建立 OAuth 2.0 憑證：
   - 應用程式類型：Web application
   - 授權重新導向 URI 加入：`http://localhost:4000/api/v1/social/callback/youtube`
4. 將 Client ID 和 Client Secret 填入 `.env`：
   ```
   YOUTUBE_CLIENT_ID=你的client_id
   YOUTUBE_CLIENT_SECRET=你的client_secret
   ```
5. 設定 OAuth 同意畫面（測試模式即可，先加自己的 Google 帳號為測試使用者）

## 實作步驟

### Step 1: 安裝 googleapis 套件
- `pnpm --filter api add googleapis`
- googleapis 內含 YouTube Data API v3 + OAuth2 client，一個套件搞定

### Step 2: 建立 YouTube API Service
- 新增 `apps/api/src/modules/social/youtube-api.service.ts`
- 封裝所有 YouTube API 呼叫：
  - `exchangeCodeForTokens(code, redirectUri)` — OAuth code → tokens
  - `refreshAccessToken(refreshToken)` — 刷新過期 token
  - `getChannelInfo(accessToken)` — 取得頻道名稱、ID、頭像、訂閱數
  - `getChannelStats(accessToken)` — 取得 views/subscribers/videoCount
  - `uploadVideo(accessToken, fileStream, metadata)` — Resumable Upload
  - `revokeToken(token)` — 撤銷 token
- 使用 `googleapis` 的 `google.youtube('v3')` 和 `google.oauth2('v2')`

### Step 3: 修改 OAuth Token Exchange（social.service.ts）
- `handleCallback()` 方法中，將 placeholder token 替換為：
  - 呼叫 `youtubeApiService.exchangeCodeForTokens(code, redirectUri)`
  - 呼叫 `youtubeApiService.getChannelInfo(accessToken)` 取得 platformUserId、platformUsername
  - 加密 tokens 後存入 SocialAccount
  - 設定 `tokenExpiresAt`（Google token 通常 1 小時過期）

### Step 4: 實作 Token Refresh（social.service.ts）
- `refreshAccountToken()` 方法中：
  - 解密取出 refreshToken
  - 呼叫 `youtubeApiService.refreshAccessToken(refreshToken)`
  - 加密新 accessToken，更新 `tokenExpiresAt`
- 在 `social-sync.service.ts` 的 sync 流程中，先檢查 token 是否過期，過期就自動刷新

### Step 5: 實作 YouTube Metrics 同步（social-sync.service.ts）
- `fetchPlatformMetrics()` 方法中，YouTube case：
  - 解密 accessToken（先確認有效，過期先 refresh）
  - 呼叫 `youtubeApiService.getChannelStats(accessToken)`
  - 回傳真實的 followers/views/likes 等數據
  - 更新 SocialAccount 的 `followerCount`
- 其他平台暫時維持 placeholder，只改 YouTube

### Step 6: 建立 BullMQ Publishing Worker
- 新增 `apps/api/src/workers/post-publish.processor.ts`
- 註冊 Queue: 在 `post-scheduler.module.ts` 加入 `BullModule.registerQueue({ name: 'post-publish' })`
- Worker 處理流程：
  1. 從 job data 取得 postId
  2. 查詢 Post + 關聯的 SocialAccount
  3. 解密 accessToken（過期就 refresh）
  4. 根據 Post 的 platforms 設定，呼叫對應平台 API
  5. YouTube: 如果有 clipId → 取得 clip file → `youtubeApiService.uploadVideo()`
  6. YouTube: 如果是純文案 → 建立社群貼文（Community Post，但 API 限制較多，先以影片為主）
  7. 成功：更新 Post status → PUBLISHED，記錄 publishedAt
  8. 失敗：更新 Post status → FAILED，記錄 errorMessage
- 加入 retry 機制：最多 3 次，backoff exponential

### Step 7: 串接 Post Scheduler → BullMQ
- `post-scheduler.service.ts` 注入 `@InjectQueue('post-publish') queue: Queue`
- `create()`: 如果 status=SCHEDULED，加入 delayed job（delay = scheduledAt - now）
- `update()`: 如果改了 scheduledAt，先移除舊 job 再建新的
- `remove()`: 移除對應的 BullMQ job
- `publishNow()`: 加入 immediate job（delay=0）

### Step 8: Token 撤銷 + 斷開連結
- `disconnectAccount()` 中：
  - 解密 accessToken
  - 呼叫 `youtubeApiService.revokeToken(accessToken)`
  - 刪除 SocialAccount record

### Step 9: 前端 OAuth Callback 處理
- 確認 `apps/web` 有 OAuth callback 頁面處理 redirect
- 連結成功後顯示帳號名稱、頻道頭像
- 連結失敗顯示錯誤訊息

### Step 10: 測試驗證
- 手動測試：連結 YouTube → 確認 token 存入 → 觸發 sync → 確認真實數據
- 手動測試：上傳影片 → AI 剪片 → 選一個 clip → 排程發佈 → 確認影片出現在 YouTube
- 確認 token 過期後自動刷新正常

## 檔案變更清單

| 操作 | 檔案 | 說明 |
|------|------|------|
| 新增 | `apps/api/src/modules/social/youtube-api.service.ts` | YouTube API 封裝 |
| 新增 | `apps/api/src/workers/post-publish.processor.ts` | BullMQ 發佈 worker |
| 修改 | `apps/api/src/modules/social/social.service.ts` | OAuth token exchange、refresh、revoke |
| 修改 | `apps/api/src/modules/social/social-sync.service.ts` | YouTube metrics 真實呼叫 |
| 修改 | `apps/api/src/modules/social/social.module.ts` | 注入 YouTubeApiService |
| 修改 | `apps/api/src/modules/post-scheduler/post-scheduler.service.ts` | 串接 BullMQ queue |
| 修改 | `apps/api/src/modules/post-scheduler/post-scheduler.module.ts` | 註冊 BullMQ queue、匯入 SocialModule |
| 修改 | `apps/api/package.json` | 加入 googleapis |
| 修改 | `.env.example` | 確認 YouTube env vars 完整 |

## 不在範圍內（之後再做）
- Instagram / TikTok / Facebook / Twitter / Threads 整合
- S3 presigned upload（目前用 local file upload 即可）
- Redis-based OAuth state（單機開發不需要）
- YouTube Community Post（API 支援有限）
- YouTube Analytics API（進階數據，Step 5 用 Data API 已足夠）
