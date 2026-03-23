# Creator Platform — 產品規格文檔

> 最後更新：2026-03-23

---

## 1. 產品定位

**一站式 AI 驅動創作者變現工具平台。** 協助內容創作者從影片生產、社群經營到多元收入建立，整合於單一儀表板中，降低工具碎片化成本。

### 目標用戶

| 用戶類型 | 描述 | 對應角色 |
|----------|------|----------|
| 個人創作者 | YouTuber、Podcaster、自媒體 | `CREATOR` |
| 經紀公司 | 管理多位創作者的 MCN | `AGENCY_MANAGER` |
| 粉絲 | 訂閱會員內容、購買數位商品 | `FAN` |
| 平台管理員 | 系統設定、租戶管理 | `ADMIN` |

### 訂閱方案

| 方案 | 定位 | 功能範圍 |
|------|------|----------|
| **FREE** | 入門試用 | 基礎功能、有限 AI 額度 |
| **STARTER** | 個人創作者 | 完整功能、標準額度 |
| **PRO** | 進階創作者 | 完整功能、進階 AI、優先支援 |
| **BUSINESS** | 團隊 / MCN | 多帳號、白標、API 存取 |

---

## 2. 功能模組總覽

```
┌─────────────────────────────────────────────────────────┐
│                    Creator Dashboard                     │
├───────────┬───────────┬───────────┬─────────────────────┤
│  內容生產  │  社群分發  │  變現工具  │  智能助手            │
│           │           │           │                      │
│ • 影片上傳 │ • 帳號連接 │ • 粉絲會員 │ • AI 知識庫          │
│ • AI 剪輯  │ • 排程發佈 │ • 數位商品 │ • AI 聊天機器人      │
│ • 短影音   │ • 數據分析 │ • 聯盟行銷 │ • AI 文案生成        │
│ • 內容探索 │ • 趨勢雷達 │ • 品牌合作 │ • AI 摘要分類        │
│           │           │ • 到達頁   │                      │
│           │           │ • Email    │                      │
└───────────┴───────────┴───────────┴─────────────────────┘
```

---

## 3. 詳細功能規格

### 3.1 認證與帳戶管理

**用戶故事：** 創作者可以快速註冊並設定帳戶，開始使用平台功能。

| 功能 | 規格 |
|------|------|
| 註冊 | Email + 密碼，自動建立 Tenant |
| 登入 | Email/密碼，JWT Token 機制 |
| OAuth | Google 登入（規劃中） |
| Onboarding | 角色選擇、社群帳號綁定引導 |
| 個人資料 | 顯示名稱、頭像、語系（預設 zh-TW）、時區 |
| Token | Access Token 15 分鐘、Refresh Token 7 天 |

### 3.2 影片上傳與 AI 剪輯

**用戶故事：** 創作者上傳長影片後，AI 自動辨識精華片段並生成短影音素材。

| 功能 | 規格 |
|------|------|
| 上傳 | S3 Presigned URL 直傳、支援大檔案 |
| 轉錄 | OpenAI Whisper 自動語音轉文字 |
| AI 摘要 | GPT-4o-mini 生成影片摘要 |
| 自動剪輯 | AI 評分精華片段、生成 Clip（起止時間、標題、Hashtag） |
| 縮圖 | 自動擷取 + AI 生成縮圖 |
| 管理 | 影片庫列表、搜尋、排序、刪除 |
| 影片狀態 | UPLOADING → UPLOADED → PROCESSING → PROCESSED / FAILED |
| Clip 狀態 | GENERATING → READY → PUBLISHED / ARCHIVED |

### 3.3 社群帳號整合

**用戶故事：** 創作者連接社群帳號後，可在單一介面管理所有平台。

| 平台 | 連接方式 | 功能 |
|------|----------|------|
| YouTube | OAuth 2.0 | 影片上傳、數據同步、頻道分析 |
| Instagram | OAuth (Graph API) | 貼文發佈、限動、數據同步 |
| TikTok | OAuth | 影片上傳、數據同步 |
| Facebook | OAuth (Graph API) | 貼文發佈、粉專管理 |
| Twitter/X | OAuth 2.0 | 推文發佈、數據同步 |
| Threads | OAuth | 貼文發佈 |

- OAuth Token 以 AES 加密存儲
- 支援 Token 自動刷新
- 追蹤粉絲數、最後同步時間

### 3.4 排程發佈

**用戶故事：** 創作者設定發佈時間，平台自動在指定時間推送至多個社群平台。

| 功能 | 規格 |
|------|------|
| 發佈類型 | 原創 / Clip 分享 / 聯盟行銷 / 贊助 |
| AI 文案 | GPT-4o-mini 根據平台特性生成文案 |
| 多平台 | 單篇內容一鍵發佈至多平台 |
| 排程 | 指定日期時間、AI 建議最佳時段 |
| 素材 | 附加圖片/影片 URL、Hashtag |
| 狀態流 | DRAFT → SCHEDULED → PUBLISHING → PUBLISHED / FAILED |
| 佇列 | BullMQ 處理排程觸發與平台 API 呼叫 |

### 3.5 數據分析

**用戶故事：** 創作者在儀表板查看各平台統一數據，了解成長趨勢。

| 指標 | 說明 |
|------|------|
| 粉絲數 | 各平台追蹤者數量與成長 |
| 觀看數 | 影片/貼文觀看次數 |
| 互動率 | 按讚、留言、分享比率 |
| 營收 | 聯盟行銷 + 會員 + 數位商品 + 品牌合作 |
| 最佳內容 | 按互動率排序的高表現內容 |
| 趨勢圖 | 時間序列折線圖（Recharts） |

### 3.6 粉絲會員系統

**用戶故事：** 創作者設定會員階層，粉絲付費訂閱獲得專屬內容與權益。

| 功能 | 規格 |
|------|------|
| 會員階層 | 自訂名稱、月費/年費、權益說明 |
| 訂閱 | Stripe Subscriptions 自動扣款 |
| 權益 | 自訂 JSON、Bot 存取層級（FREE / MEMBER / PREMIUM） |
| 狀態 | ACTIVE / PAST_DUE / CANCELLED / EXPIRED |
| 管理 | 會員列表、收入統計、階層排序 |
| 上限 | 可設定單階層最大會員數 |

### 3.7 數位商品商店

**用戶故事：** 創作者上架 PDF、模板、預設集等數位商品，粉絲直接購買下載。

| 功能 | 規格 |
|------|------|
| 商品類型 | PDF / Template / Preset / eBook / 影片課程 / 音訊 / 其他 |
| 定價 | TWD 計價（分為單位）、原價 + 促銷價 |
| AI 描述 | GPT 自動生成商品描述 |
| 標籤 | 手動標籤 + AI 自動標籤 |
| 訂單 | 購買者信箱、金額、狀態（PENDING / COMPLETED / REFUNDED） |
| 下載 | 下載次數追蹤 |
| 統計 | 銷售量、總營收 |

### 3.8 聯盟行銷

**用戶故事：** 創作者生成專屬追蹤連結，追蹤點擊和轉換以計算佣金。

| 功能 | 規格 |
|------|------|
| 追蹤連結 | 唯一 tracking code、短網址 |
| 事件追蹤 | CLICK / ADD_TO_CART / PURCHASE / REFUND |
| 歸因 | 訪客 ID、IP 雜湊、來源貼文、Referrer |
| 佣金 | 自訂佣金比率（Decimal 精度 5,4） |
| 統計 | 點擊數、轉換數、總營收 |

### 3.9 品牌合作管理

**用戶故事：** 創作者管理品牌業配流程，AI 協助撰寫企劃書。

| 功能 | 規格 |
|------|------|
| 合作類型 | 贊助貼文 / 聯盟 / 大使 / 產品評測 / 活動 |
| 狀態流 | DRAFT → PROPOSAL_SENT → NEGOTIATING → CONFIRMED → IN_PROGRESS → COMPLETED |
| AI 提案 | GPT 根據品牌/創作者資料生成提案文字 |
| 交付物 | JSON 格式定義交付清單 |
| 預算 | 預算範圍（JSON）、實際營收追蹤 |
| 聯絡人 | 品牌聯絡資訊（JSON） |
| 時程 | 合作起訖日期 |

### 3.10 AI 知識庫

**用戶故事：** 創作者建立專屬知識庫，用於訓練 AI 客服機器人。

| 功能 | 規格 |
|------|------|
| 資料來源 | 文件上傳 / URL 爬取 / 影片逐字稿 / 手動輸入 / QA 配對 |
| 向量化 | OpenAI text-embedding → pgvector (1536 維) |
| 分塊 | 自動分塊並記錄 chunk index、token 數、來源參照 |
| 狀態 | PROCESSING → READY / ERROR |
| 統計 | 文件數、分塊數 |

### 3.11 AI 聊天機器人

**用戶故事：** 創作者建立 AI 客服，粉絲可即時提問並獲得基於知識庫的回答。

| 功能 | 規格 |
|------|------|
| 設定 | 名稱、頭像、歡迎訊息、System Prompt |
| 人格 | JSON 格式定義 AI 對話風格 |
| 知識庫 | 綁定知識庫進行 RAG 檢索 |
| 存取控制 | FREE（公開）/ MEMBER / PREMIUM |
| 對話 | 記錄對話歷程（JSON Messages）、滿意度評分 |
| 嵌入 | 可嵌入外部網站（embed config） |
| 統計 | 對話數、訊息數 |

### 3.12 到達頁（Landing Page）

**用戶故事：** 創作者建立個人品牌頁面，集中展示連結和作品。

| 功能 | 規格 |
|------|------|
| URL | `/p/{slug}` — 唯一 slug |
| 內容 | 標題、副標題、個人簡介、頭像、封面 |
| 主題 | 預設主題 + 自訂配色（JSON） |
| 社群連結 | JSON 格式定義平台與 URL |
| CTA 按鈕 | JSON 格式定義按鈕文字與連結 |
| 區塊 | JSON 格式定義自訂區塊 |
| 自訂 CSS | 進階用戶可覆寫樣式 |
| 發佈 | 草稿/上線切換 |
| 統計 | 瀏覽次數 |
| SEO | SSR 渲染、Meta 標籤 |

### 3.13 Email 行銷

**用戶故事：** 創作者收集訂閱者名單，發送電子報與序列自動化信件。

| 功能 | 規格 |
|------|------|
| 訂閱者 | Email、姓名、來源（到達頁/商品購買/手動）、標籤 |
| 活動類型 | SINGLE（單次）/ SEQUENCE（序列） |
| 序列信 | 多封 Email 按天數間隔自動寄送 |
| 受眾篩選 | 按標籤過濾目標訂閱者 |
| 範本 | 主旨 + 內文、排序、延遲天數 |
| 狀態 | DRAFT → SCHEDULED → SENT |
| 追蹤 | 寄送數、開信數、點擊數 |

### 3.14 內容探索與趨勢雷達

**用戶故事：** 創作者瀏覽跨平台熱門內容，發掘創作靈感和趨勢。

| 功能 | 規格 |
|------|------|
| 內容收集 | Playwright 爬取 Dcard、Threads、TikTok 等平台 |
| AI 處理 | 自動摘要、分類（科技/生活/商業等）、標籤 |
| 收藏 | 星號標記感興趣的內容 |
| Chrome 擴充 | 在社群平台上一鍵收藏至平台 |
| 趨勢偵測 | 關鍵字監控、病毒內容偵測 |

### 3.15 儀表板總覽

**用戶故事：** 創作者登入後一目了然掌握關鍵指標。

| 區塊 | 內容 |
|------|------|
| 統計卡片 | 粉絲數、本月營收、排程中貼文數、會員數 |
| 近期貼文 | 最新已發佈/排程貼文 |
| 平台分佈 | 各社群帳號狀態 |
| 快捷操作 | 新增影片、新增貼文、查看分析 |

---

## 4. 多租戶與白標

| 租戶方案 | 功能 |
|----------|------|
| **FREE** | 基礎功能、平台品牌 |
| **PRO** | 完整功能、更高額度 |
| **ENTERPRISE** | 自訂域名、團隊管理 |
| **WHITELABEL** | 完全白標、自訂 Logo + 主題 + 域名、API 存取 |

- 每個 Tenant 有獨立 slug 與可選 custom domain
- 主題設定以 JSON 格式存儲
- 資料隔離由 Prisma Middleware 自動處理

---

## 5. API 設計規範

### 5.1 端點格式

```
{METHOD} /api/v1/{module}/{resource}

# 範例
GET    /api/v1/videos              # 影片列表（cursor 分頁）
POST   /api/v1/videos/upload-url   # 取得上傳 URL
GET    /api/v1/videos/:id          # 影片詳情
DELETE /api/v1/videos/:id          # 刪除影片
PATCH  /api/v1/posts/:id           # 更新貼文
POST   /api/v1/auth/login          # 登入
```

### 5.2 分頁（Cursor-based）

```json
// Request
GET /api/v1/videos?limit=20&cursor=uuid-of-last-item

// Response
{
  "data": [...],
  "meta": {
    "cursor": "uuid-of-last-item",
    "hasMore": true,
    "total": 142
  }
}
```

### 5.3 錯誤回應（RFC 7807）

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "title must be a string",
  "errors": [...]
}
```

---

## 6. 非功能需求

| 項目 | 要求 |
|------|------|
| 效能 | API 回應 < 200ms（P95）、排程任務誤差 < 60s |
| 安全 | JWT + bcrypt + AES、CORS 白名單、Helmet、輸入驗證 |
| 可用性 | 核心流程（發佈/支付）需有錯誤重試機制 |
| 可擴展 | 模組化架構可沿邊界拆分為微服務 |
| 國際化 | 預設 zh-TW、支援使用者語系與時區 |
| SEO | 公開到達頁 SSR 渲染、Meta 標籤可設定 |
| 合規 | Stripe 處理卡號（PCI DSS）、密碼不明文存儲 |

---

## 7. 開發狀態追蹤

### 後端 API（已完成）

- [x] Phase 1：Auth、User、Tenant、Video、Social、Post Scheduler、Payment、Dashboard
- [x] Phase 2：Affiliate、Knowledge Base、Bot、Membership、進階平台整合、Analytics
- [x] Phase 3：Brand Deal、White-label、API Gateway、AI 最佳發佈時間

### 待完成項目

- [ ] 前端頁面完整實作（15+ 頁面 UI）
- [ ] S3 Presigned URL 實際串接
- [ ] BullMQ Worker 實際影片處理（FFmpeg + Whisper）
- [ ] Google OAuth 登入
- [ ] PostgreSQL Row-Level Security
- [ ] Email 實際寄送整合（SES / SendGrid）
- [ ] Stripe Webhook 完整事件處理
- [ ] 生產環境部署架構（CI/CD、監控）
- [ ] 單元測試與整合測試
- [ ] API 文檔（Swagger 完善）

---

## 8. 資料模型摘要

共 **24 個資料模型**：

| 模型 | 用途 | 關鍵欄位 |
|------|------|----------|
| Tenant | 租戶 | plan, customDomain, themeConfig |
| User | 使用者 | role, stripeConnectId, locale |
| SocialAccount | 社群帳號 | platform, accessToken (加密), followerCount |
| Video | 影片 | status, transcript (JSON), aiSummary |
| VideoClip | 影片剪輯 | startTime, endTime, aiScore |
| Post | 貼文 | type, status, scheduledAt, platforms (JSON) |
| AffiliateLink | 聯盟連結 | trackingCode, commissionRate, revenueTotal |
| AffiliateEvent | 聯盟事件 | eventType, visitorId, revenueAmount |
| KnowledgeBase | 知識庫 | sourceType, status, chunkCount |
| KnowledgeChunk | 知識分塊 | embedding (vector 1536), content |
| BotConfig | 機器人 | systemPrompt, accessTier, knowledgeBaseId |
| Conversation | 對話 | messages (JSON[]), satisfactionScore |
| MembershipTier | 會員階層 | priceMonthly, benefits, botAccessTier |
| Membership | 會員訂閱 | status, stripeSubscriptionId |
| BrandDeal | 品牌合作 | dealType, status, aiProposal |
| PlatformAnalytics | 平台分析 | date, followers, views, engagementRate |
| Subscription | 平台訂閱 | plan, status, usage, limits |
| ContentClip | 蒐集內容 | platform, aiSummary, aiCategory, aiTags |
| LandingPage | 到達頁 | slug, theme, ctaButtons, sections |
| DigitalProduct | 數位商品 | productType, price, aiDescription |
| ProductOrder | 商品訂單 | buyerEmail, amount, downloadCount |
| EmailSubscriber | 郵件訂閱者 | source, tags, isActive |
| EmailCampaign | 郵件活動 | type, targetTags, openCount, clickCount |
| EmailTemplate | 郵件範本 | subject, body, delayDays |
