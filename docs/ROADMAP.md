# Creator Platform — 開發路線圖

> 最後更新：2026-04-01
> 整體完成度：~90%（31 個後端模組全部實作、20 個前端頁面、Chrome 擴充功能）

---

## 目標一：部署上線（部署 + 安全）

讓平台達到 production-ready 狀態，可以對外提供服務。

### 1.1 部署基礎設施

- [ ] **Dockerfile** — API 和 Web 各一個多階段建構 Dockerfile
- [ ] **docker-compose.production.yml** — 生產環境編排（API + Web + PostgreSQL + Redis + MinIO/R2）
- [ ] **CI/CD Pipeline** — GitHub Actions：lint → test → build → deploy
- [ ] **環境變數管理** — 區分 dev / staging / production，使用 GitHub Secrets 或 Vault
- [ ] **資料庫遷移** — 從 `prisma db push` 切換到 `prisma migrate`，建立版本化遷移檔
- [ ] **SSL/Domain** — 設定自訂域名 + HTTPS (Let's Encrypt 或 Cloudflare)
- [ ] **靜態資源 CDN** — 前端 build 產出部署至 CDN (Cloudflare Pages / Vercel)

### 1.2 API 安全加固

- [ ] **Rate Limiting** — 驗證 api-gateway 模組的速率限制是否生效，補上全域 throttle guard
- [ ] **CORS** — 限制為前端域名，移除 `*` wildcard
- [ ] **Helmet** — 確認 HTTP 安全 header 配置正確
- [ ] **Input Validation** — 確認所有 controller 都經過 `ValidationPipe` + class-validator
- [ ] **SQL Injection** — 審計所有 `$queryRawUnsafe` / `$executeRawUnsafe` 呼叫（knowledge-base 模組）
- [ ] **認證安全** — JWT 過期時間、refresh token rotation、bcrypt rounds 確認

### 1.3 Stripe 生產環境

- [ ] **Webhook 簽名驗證** — production 必須啟用 `STRIPE_WEBHOOK_SECRET`，移除 dev fallback 的無簽名解析
- [ ] **Stripe Connect** — 確認 Connect 帳戶設定（數位商品賣家分潤）
- [ ] **價格方案** — 在 Stripe Dashboard 建立 PRO / ENTERPRISE price ID
- [ ] **測試完整付款流程** — 用 Stripe test mode 跑完：結帳 → webhook → 訂閱啟用 → 續訂 → 取消

### 1.4 Storage 生產環境

- [ ] **Cloudflare R2** — 建立 production bucket，設定 STORAGE_* 環境變數
- [ ] **MinIO → R2 遷移** — 確認程式碼在 R2 endpoint 下正常運作
- [ ] **Bucket Policy** — 設定公開讀取（封面圖片）和私有（影片檔案）分離
- [ ] **Backup** — 資料庫定期備份策略

---

## 目標二：程式碼品質（測試 + 監控）

提升測試覆蓋率和可觀測性，確保穩定運行。

### 2.1 測試覆蓋提升

目前 15/31 模組有測試（48%），目標提升至 25/31（80%）。

**高優先（安全/金流相關）：**

- [ ] **social** — OAuth 連接/回調流程，多平台 token 管理
- [ ] **api-gateway** — API key 驗證、webhook 簽名、rate limit 邏輯
- [ ] **membership** — 訂閱方案 CRUD、Stripe 整合、會員權限

**中優先（核心功能）：**

- [ ] **analytics** — 數據聚合邏輯、跨平台比較
- [ ] **landing-page** — AI 生成、slug 唯一性、公開頁面存取
- [ ] **affiliate** — 聯盟連結追蹤、事件記錄、統計計算
- [ ] **dashboard** — Overview 聚合、快速統計

**低優先（輔助功能）：**

- [ ] **ai** — 各 AI 方法的 error handling 和 fallback
- [ ] **brevo** — Email 發送 mock 測試
- [ ] **content-clip** — CRUD + 星號切換

### 2.2 監控與可觀測性

- [ ] **BullMQ Dashboard** — 安裝 bull-board 或 BullMQ Pro 監控面板（5 個佇列：video-process, post-publish, email-send, content-repurpose, content-strategy）
- [ ] **Sentry 強化** — 確認所有 unhandled rejection 和 queue worker 錯誤都有上報
- [ ] **健康檢查端點** — `GET /health` 回傳 DB/Redis/Storage 連線狀態
- [ ] **AI 用量追蹤** — 記錄每次 OpenAI API 呼叫的 token 用量和費用（15+ 模組使用 AiService）
- [ ] **Log 結構化** — 統一 JSON log 格式，方便 ELK/Loki 收集
- [ ] **告警** — 關鍵指標告警：佇列堆積、API 錯誤率、AI 呼叫失敗率

### 2.3 既有程式碼品質改善

- [ ] **移除 ts-jest 依賴** — 已切換至 @swc/jest，可移除 ts-jest package
- [ ] **修復 worker 洩漏** — 部分測試有 `failed to exit gracefully` warning，排查 open handles
- [ ] **Prisma 遷移** — 建立正式 migration history，取代 `db push`

---

## 目標三：功能完善（前端 + 影片 + 趨勢）

補齊現有功能的體驗和完整度。

### 3.1 前端公開頁面強化

- [ ] **Landing Page** (`/p/[slug]`) — 增加更多區塊模板（定價表、FAQ、影片嵌入、社群連結）
- [ ] **數位商店** (`/store/[userId]`) — 商品分類篩選、搜尋、排序、SEO meta tags
- [ ] **訂單確認頁** (`/store/order/[orderId]`) — 下載進度、email 通知確認、收據
- [ ] **公開 Bot 聊天頁** — 讓粉絲可以直接在公開頁面和 Bot 對話

### 3.2 影片處理 Pipeline 完善

- [ ] **S3 完整流程** — markUploaded → 下載到本地 → FFmpeg 處理（thumbnail、轉錄、AI 剪輯）→ 上傳結果回 S3
- [ ] **處理進度回報** — 透過 WebSocket 或 polling 回報影片處理進度給前端
- [ ] **Short Video 上傳** — 生成的短影片也上傳到 Storage，而非只存在本地
- [ ] **S3 Presigned Download** — 影片播放改用 presigned URL（而非 express static）
- [ ] **大檔案分片上傳** — 支援 multipart upload（>1GB 影片）

### 3.3 趨勢雷達強化

- [ ] **趨勢設定 UI 重構** — 關鍵字管理（新增/刪除/啟停）、通知頻率設定、平台偏好
- [ ] **趨勢通知** — 當追蹤關鍵字命中新趨勢時，透過 email / in-app notification 通知
- [ ] **趨勢歷史圖表** — 在趨勢詳情頁加入 7/14/30 天趨勢曲線圖
- [ ] **自訂 RSS 來源** — 讓使用者自行添加 RSS feed URL

### 3.4 其他功能補齊

- [ ] **AI 成本控制** — 依訂閱方案限制 AI 呼叫次數，超額提示升級
- [ ] **多語系** — i18n 基礎架構（目前全繁體中文，未來支援英文）
- [ ] **Webhook 測試工具** — 在設定頁提供 webhook 測試發送功能
- [ ] **匯出功能** — 訂閱者名單 CSV 匯出、分析報表 PDF 匯出

---

## 附錄：目前測試覆蓋

| 模組 | 測試 | Tests |
|------|------|-------|
| storage | ✅ | 9 |
| knowledge-base | ✅ | 8 |
| bot | ✅ | 7 |
| email-marketing | ✅ | 8 |
| digital-product | ✅ | 10 + 5 (E2E) |
| payment | ✅ | 10 + 8 (E2E) |
| post-scheduler | ✅ | 12 |
| brand-deal | ✅ | 11 |
| trend-radar | ✅ | 10 + 6 (viral) |
| auth | ✅ | (既有) |
| content-repurpose | ✅ | (既有) |
| content-strategy | ✅ | (既有) |
| interactions | ✅ | (既有) |
| notification | ✅ | (既有) |
| video | ✅ | (既有) |
| **合計** | **15/31** | **104+** |
