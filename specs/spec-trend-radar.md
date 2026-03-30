# 趨勢雷達 2.0 — 技術規格文檔

> Phase: 6 | Priority: P0 | Status: draft
> PRD: specs/prd-trend-radar.md

## 概述

將現有趨勢雷達從 stateless in-memory cache 升級為持久化、多平台、主動通知的趨勢監控系統。新增 Prisma models 儲存趨勢快照（14 天）、關鍵字監控、站內通知（WebSocket）與 Brevo Email 通知。Playwright 爬蟲改為 headless mode 由 BullMQ worker 背景執行，解決 headed mode 瀏覽器視窗問題。新增爆紅偵測演算法，基於 relevanceScore 差值觸發即時警報。

## 依賴關係

- **前置模組**: Auth (1.1), User (1.2), AiModule, PrismaModule, RedisModule
- **串接模組**: ContentStrategy（已有 getTrends 整合）, AutoBrowse（重構 Playwright 共用）
- **新增模組**: NotificationModule（全平台共用）, BrevoModule（Email 服務）
- **使用的共用元件**: JwtAuthGuard, PrismaService, @CurrentUser(), ConfigService
- **外部服務**: OpenAI (GPT-4o-mini), Brevo (Email API), YouTube RSS, Dcard API
- **佇列**: BullMQ (`trend-radar` queue, `notification` queue)
- **排程**: @nestjs/schedule（自動刷新、資料清理）
- **即時通訊**: @nestjs/websockets + socket.io（站內通知推送）

---

## Database Models

### 新增 Enums

```prisma
enum TrendPhase {
  NEW        // 首次偵測
  RISING     // 上升中
  PEAK       // 高峰期
  DECLINING  // 衰退中
}

enum TrendSourcePlatform {
  RSS_TECHORANGE
  RSS_ITHOME
  RSS_BNEXT
  RSS_TECHCRUNCH
  RSS_THEVERGE
  RSS_PRODUCTHUNT
  RSS_CREATOR_ECONOMY
  API_DCARD
  API_YOUTUBE_TRENDING
  SCRAPER_TIKTOK
  SCRAPER_THREADS
}

enum NotificationType {
  TREND_KEYWORD_HIT     // 關鍵字命中
  TREND_VIRAL_ALERT     // 爆紅警報
  TREND_DAILY_SUMMARY   // 每日摘要
  SYSTEM                // 系統通知（未來其他模組可用）
}
```

### 新增 Model: TrendSnapshot

每次排程刷新產生一筆 snapshot，記錄該次分析的完整結果。

```prisma
model TrendSnapshot {
  id            String               @id @default(uuid()) @db.Uuid
  sources       TrendSourcePlatform[]
  topicCount    Int                  @map("topic_count")
  aiAnalysis    String               @map("ai_analysis")          // AI 每日摘要
  generatedAt   DateTime             @default(now()) @map("generated_at")

  topics        TrendTopic[]

  @@index([generatedAt(sort: Desc)])
  @@map("trend_snapshots")
}
```

### 新增 Model: TrendTopic

單一趨勢主題，屬於某次 snapshot。用 `fingerprint` 做跨 snapshot 的主題關聯（同一主題在不同時間點的出現）。

```prisma
model TrendTopic {
  id              String               @id @default(uuid()) @db.Uuid
  snapshotId      String               @map("snapshot_id") @db.Uuid
  fingerprint     String               @db.VarChar(64)              // SHA-256(normalized title) 用於跨 snapshot 追蹤
  title           String               @db.VarChar(500)
  summary         String
  source          String               @db.VarChar(100)             // 來源名稱
  sourcePlatform  TrendSourcePlatform  @map("source_platform")
  category        String               @db.VarChar(50)
  relevanceScore  Float                @map("relevance_score")      // 0-1
  contentIdeas    String[]             @map("content_ideas")
  url             String?
  phase           TrendPhase           @default(NEW)
  isCrossPlatform Boolean              @default(false) @map("is_cross_platform")
  firstSeenAt     DateTime             @default(now()) @map("first_seen_at")

  snapshot        TrendSnapshot        @relation(fields: [snapshotId], references: [id], onDelete: Cascade)

  @@index([snapshotId])
  @@index([fingerprint, snapshotId])
  @@index([category])
  @@map("trend_topics")
}
```

### 新增 Model: TrendKeyword

使用者追蹤的關鍵字設定。

```prisma
model TrendKeyword {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  keyword     String   @db.VarChar(100)
  isActive    Boolean  @default(true) @map("is_active")
  lastHitAt   DateTime? @map("last_hit_at")
  hitCount    Int      @default(0) @map("hit_count")
  createdAt   DateTime @default(now()) @map("created_at")

  user        User     @relation(fields: [userId], references: [id])
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([userId, keyword])
  @@index([tenantId, userId])
  @@map("trend_keywords")
}
```

### 新增 Model: TrendUserSettings

使用者的趨勢通知偏好設定。

```prisma
model TrendUserSettings {
  id                      String   @id @default(uuid()) @db.Uuid
  userId                  String   @unique @map("user_id") @db.Uuid
  tenantId                String   @map("tenant_id") @db.Uuid
  notifyKeywordHit        Boolean  @default(true) @map("notify_keyword_hit")
  notifyViralAlert        Boolean  @default(true) @map("notify_viral_alert")
  notifyDailySummary      Boolean  @default(true) @map("notify_daily_summary")
  emailKeywordHit         Boolean  @default(false) @map("email_keyword_hit")
  emailViralAlert         Boolean  @default(false) @map("email_viral_alert")
  emailDailySummary       Boolean  @default(true) @map("email_daily_summary")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt @map("updated_at")

  user                    User     @relation(fields: [userId], references: [id])
  tenant                  Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("trend_user_settings")
}
```

### 新增 Model: Notification（全平台共用）

```prisma
model Notification {
  id          String           @id @default(uuid()) @db.Uuid
  userId      String           @map("user_id") @db.Uuid
  tenantId    String           @map("tenant_id") @db.Uuid
  type        NotificationType
  title       String           @db.VarChar(200)
  body        String
  metadata    Json?            @default("{}")     // 結構化資料（如 trendTopicId, keywordId）
  linkUrl     String?          @map("link_url")   // 點擊後導向的頁面
  isRead      Boolean          @default(false) @map("is_read")
  readAt      DateTime?        @map("read_at")
  createdAt   DateTime         @default(now()) @map("created_at")

  user        User             @relation(fields: [userId], references: [id])
  tenant      Tenant           @relation(fields: [tenantId], references: [id])

  @@index([tenantId, userId, isRead, createdAt(sort: Desc)])
  @@index([createdAt])
  @@map("notifications")
}
```

### 修改現有 Models

**User** — 新增 relations：
```prisma
model User {
  // ... existing fields
  trendKeywords      TrendKeyword[]
  trendSettings      TrendUserSettings?
  notifications      Notification[]
}
```

**Tenant** — 新增 relations：
```prisma
model Tenant {
  // ... existing fields
  trendKeywords      TrendKeyword[]
  trendUserSettings  TrendUserSettings[]
  notifications      Notification[]
}
```

---

## API Endpoints

### 趨勢資料

#### `GET /api/v1/trends`
- **描述**: 取得最新趨勢報告（從最新 snapshot 讀取）
- **認證**: Required
- **Query**:
```typescript
{
  category?: string;          // 篩選分類
  platform?: TrendSourcePlatform;  // 篩選來源平台
  phase?: TrendPhase;        // 篩選趨勢階段（NEW, RISING, PEAK, DECLINING）
}
```
- **Response** `200`:
```typescript
{
  topics: TrendTopicResponse[];
  aiAnalysis: string;
  generatedAt: string;
  sources: string[];
  nextRefreshAt: string;       // 下次自動刷新時間
}

interface TrendTopicResponse {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourcePlatform: TrendSourcePlatform;
  category: string;
  relevanceScore: number;
  contentIdeas: string[];
  url: string | null;
  phase: TrendPhase;
  isCrossPlatform: boolean;
  firstSeenAt: string;
}
```
- **Business Logic**:
  1. 從 DB 讀取最新 TrendSnapshot + 關聯 TrendTopics
  2. 若無 snapshot 或 snapshot 過期（> 2 小時），觸發一次同步刷新
  3. 套用 query 篩選條件
  4. 計算 nextRefreshAt

#### `POST /api/v1/trends/refresh`
- **描述**: 手動觸發趨勢刷新
- **認證**: Required
- **Response** `200`: 同 GET /trends 的 response
- **Business Logic**: 立即執行完整刷新流程（RSS + API + Playwright），寫入新 snapshot
- **Rate Limit**: 每用戶每 10 分鐘 1 次

#### `GET /api/v1/trends/:fingerprint/history`
- **描述**: 取得單一趨勢主題的 14 天歷史走勢
- **認證**: Required
- **Response** `200`:
```typescript
{
  fingerprint: string;
  title: string;
  currentPhase: TrendPhase;
  history: {
    date: string;           // ISO date
    relevanceScore: number;
    snapshotId: string;
  }[];
  firstSeenAt: string;
  peakScore: number;
  peakDate: string;
}
```
- **Business Logic**:
  1. 以 fingerprint 查詢所有相關 TrendTopic（跨 snapshot）
  2. 每天取最高 relevanceScore 作為當日數值
  3. 計算 peakScore 和 peakDate

### 關鍵字監控

#### `GET /api/v1/trends/keywords`
- **描述**: 列出使用者的追蹤關鍵字
- **認證**: Required
- **Response** `200`:
```typescript
{
  keywords: {
    id: string;
    keyword: string;
    isActive: boolean;
    lastHitAt: string | null;
    hitCount: number;
    createdAt: string;
  }[];
  quota: { used: number; max: number };  // max: 20
}
```

#### `POST /api/v1/trends/keywords`
- **描述**: 新增追蹤關鍵字
- **認證**: Required
- **Request Body**:
```typescript
{
  keyword: string;  // 2-50 chars, trimmed
}
```
- **Response** `201`: keyword object
- **Errors**: `400` 格式錯誤, `409` 已存在, `403` 超過上限 (20)

#### `DELETE /api/v1/trends/keywords/:id`
- **描述**: 移除追蹤關鍵字
- **認證**: Required
- **Response** `204`

### 通知設定

#### `GET /api/v1/trends/settings`
- **描述**: 取得趨勢通知偏好
- **認證**: Required
- **Response** `200`: TrendUserSettings 物件（不存在則返回預設值）

#### `PATCH /api/v1/trends/settings`
- **描述**: 更新趨勢通知偏好
- **認證**: Required
- **Request Body**:
```typescript
{
  notifyKeywordHit?: boolean;
  notifyViralAlert?: boolean;
  notifyDailySummary?: boolean;
  emailKeywordHit?: boolean;
  emailViralAlert?: boolean;
  emailDailySummary?: boolean;
}
```
- **Response** `200`: 更新後的 settings

### 通知（全平台共用）

#### `GET /api/v1/notifications`
- **描述**: 列出通知（cursor-based 分頁）
- **認證**: Required
- **Query**: `cursor`, `limit` (1-50, default 20), `unreadOnly` (boolean, default false)
- **Response** `200`:
```typescript
{
  data: NotificationResponse[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
}

interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, any>;
  linkUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
```

#### `POST /api/v1/notifications/:id/read`
- **描述**: 標記單則通知為已讀
- **認證**: Required
- **Response** `200`: `{ id, isRead: true, readAt: string }`

#### `POST /api/v1/notifications/read-all`
- **描述**: 標記所有未讀通知為已讀
- **認證**: Required
- **Response** `200`: `{ updatedCount: number }`

#### `GET /api/v1/notifications/unread-count`
- **描述**: 取得未讀通知數量（輕量 API，供 header badge 使用）
- **認證**: Required
- **Response** `200`: `{ count: number }`

---

## Business Logic

### 1. 趨勢刷新流程（BullMQ Worker）

```
Cron 觸發 or 手動 POST /refresh
       │
       ▼
trend-radar queue.add('refresh', {})
       │
       ▼
TrendRadarProcessor.process(job)
       │
       ├─ 1. 並行收集資料：
       │   ├─ RSS feeds (8 sources) → fetchRssFeeds()
       │   ├─ Dcard JSON API → fetchDcardApi()
       │   ├─ YouTube Trending RSS → fetchYouTubeTrending()
       │   └─ [每 6 小時] Playwright headless:
       │       ├─ TikTok Explore → scrapeTikTok()
       │       └─ Threads Trending → scrapeThreads()
       │
       ├─ 2. 合併 + 去重（by URL）
       │   └─ 限制 60 items 送入 AI
       │
       ├─ 3. AI 分析 (GPT-4o-mini):
       │   ├─ generateJson: 結構化趨勢主題 (8-15 topics)
       │   └─ chat: 每日摘要 (150-200 字)
       │
       ├─ 4. 計算 fingerprint:
       │   └─ SHA-256(normalizeTitle(title))
       │   └─ normalizeTitle: lowercase → 移除標點/空白 → trim
       │
       ├─ 5. 跨 snapshot 關聯:
       │   ├─ 查詢最近 14 天同 fingerprint 的 TrendTopic
       │   ├─ 若有歷史記錄 → 繼承 firstSeenAt
       │   ├─ 計算 phase:
       │   │   ├─ 無歷史 → NEW
       │   │   ├─ score 較前次 ↑ ≥ 0.05 → RISING
       │   │   ├─ score 較前次 ↓ ≥ 0.05 → DECLINING
       │   │   └─ score 為歷史最高 ± 0.05 → PEAK
       │   └─ 偵測跨平台：同 fingerprint 出現在 ≥ 2 個 sourcePlatform → isCrossPlatform
       │
       ├─ 6. 寫入 DB:
       │   ├─ 建立 TrendSnapshot
       │   └─ 批次建立 TrendTopic[]
       │
       ├─ 7. 爆紅偵測:
       │   └─ 觸發 detectViralTrends(newTopics, previousTopics)
       │
       └─ 8. 關鍵字比對:
           └─ 觸發 matchKeywords(newTopics)
```

### 2. 爆紅偵測演算法

```typescript
async detectViralTrends(
  currentTopics: TrendTopic[],
  previousTopics: TrendTopic[],  // 上一次 snapshot 的 topics
): Promise<void> {
  const previousMap = new Map(previousTopics.map(t => [t.fingerprint, t]));

  for (const topic of currentTopics) {
    const prev = previousMap.get(topic.fingerprint);
    const isViral =
      // 條件 1: score 突增 ≥ 0.3
      (prev && topic.relevanceScore - prev.relevanceScore >= 0.3) ||
      // 條件 2: 首次出現且 score ≥ 0.8
      (!prev && topic.relevanceScore >= 0.8) ||
      // 條件 3: 跨平台首次偵測
      (topic.isCrossPlatform && !prev?.isCrossPlatform);

    if (isViral) {
      // AI 生成推薦切入角度
      const angle = await this.aiService.chat(
        '你是創作者顧問。根據以下爆紅趨勢，用 2-3 句話建議創作者如何切入製作內容。',
        `趨勢：${topic.title}\n摘要：${topic.summary}`,
        { maxTokens: 150 },
      );

      // 查詢所有啟用 notifyViralAlert 的用戶
      const users = await this.prisma.trendUserSettings.findMany({
        where: { notifyViralAlert: true },
        select: { userId: true, tenantId: true, emailViralAlert: true },
      });

      // 批次建立通知
      await this.notificationService.sendBatch(
        users.map(u => ({
          userId: u.userId,
          tenantId: u.tenantId,
          type: 'TREND_VIRAL_ALERT',
          title: `🔥 爆紅警報：${topic.title}`,
          body: `${topic.summary}\n\n💡 建議切入：${angle}`,
          metadata: { fingerprint: topic.fingerprint, relevanceScore: topic.relevanceScore },
          linkUrl: `/trends?fingerprint=${topic.fingerprint}`,
          sendEmail: u.emailViralAlert,
        })),
      );
    }
  }
}
```

### 3. 關鍵字比對流程

```typescript
async matchKeywords(topics: TrendTopic[]): Promise<void> {
  // 1. 取得所有 active 關鍵字（去重）
  const allKeywords = await this.prisma.trendKeyword.findMany({
    where: { isActive: true },
    include: { user: { select: { id: true, tenantId: true } } },
  });

  // 2. 按關鍵字分組
  const keywordGroups = new Map<string, TrendKeyword[]>();
  for (const kw of allKeywords) {
    const normalized = kw.keyword.toLowerCase();
    const group = keywordGroups.get(normalized) || [];
    group.push(kw);
    keywordGroups.set(normalized, group);
  }

  // 3. AI 語意比對（批次）
  const topicTexts = topics.map(t => `${t.title} ${t.summary}`).join('\n');
  const uniqueKeywords = [...keywordGroups.keys()];

  const matches = await this.aiService.generateJson<{
    matches: { keyword: string; topicIndices: number[] }[];
  }>(
    `你是語意比對引擎。判斷以下關鍵字是否與任一趨勢主題語意相關。
不是純字串比對，而是語意相關性（例如「AI 工具」應匹配「ChatGPT 新功能」）。
只回傳有命中的關鍵字。

回覆 JSON: { "matches": [{ "keyword": "xxx", "topicIndices": [0, 2] }] }`,
    `關鍵字：${uniqueKeywords.join(', ')}\n\n趨勢主題：\n${topics.map((t, i) => `[${i}] ${t.title}: ${t.summary}`).join('\n')}`,
    { maxTokens: 512 },
  );

  // 4. 發送通知
  for (const match of matches?.matches ?? []) {
    const subscribers = keywordGroups.get(match.keyword) || [];
    const matchedTopics = match.topicIndices.map(i => topics[i]).filter(Boolean);

    for (const kw of subscribers) {
      // 取得用戶設定
      const settings = await this.prisma.trendUserSettings.findUnique({
        where: { userId: kw.userId },
      });
      if (settings && !settings.notifyKeywordHit) continue;

      await this.notificationService.send({
        userId: kw.userId,
        tenantId: kw.user.tenantId,
        type: 'TREND_KEYWORD_HIT',
        title: `🎯 關鍵字命中：${kw.keyword}`,
        body: matchedTopics.map(t => `• ${t.title}`).join('\n'),
        metadata: {
          keywordId: kw.id,
          keyword: kw.keyword,
          fingerprints: matchedTopics.map(t => t.fingerprint),
        },
        linkUrl: '/trends',
        sendEmail: settings?.emailKeywordHit ?? false,
      });

      // 更新 keyword hitCount + lastHitAt
      await this.prisma.trendKeyword.update({
        where: { id: kw.id },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      });
    }
  }
}
```

### 4. Fingerprint 演算法

```typescript
import { createHash } from 'crypto';

function generateFingerprint(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')  // 只保留字母和數字（支援 CJK）
    .trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
```

使用 SHA-256 前 16 字元（64 bits）作為 fingerprint。碰撞機率在 10 萬筆以內可忽略。選擇截斷而非完整 hash 是為了節省 index 空間和方便 URL 傳遞。

### 5. Cron 排程設計

```typescript
@Injectable()
export class TrendRadarCron {
  constructor(
    @InjectQueue('trend-radar') private readonly trendQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly brevoService: BrevoService,
    private readonly notificationService: NotificationService,
  ) {}

  // RSS + API 每 2 小時（白天 8:00-22:00 UTC+8）
  @Cron('0 0,2,4,6,8,10,12,14 * * *')  // UTC: 0,2,4,...14 → UTC+8: 8,10,...22
  async scheduledRefresh() {
    await this.trendQueue.add('refresh', { includeScraper: false }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    });
  }

  // Playwright 爬蟲每 6 小時（含 TikTok + Threads）
  @Cron('0 1,7,13,19 * * *')  // UTC: 1,7,13,19 → UTC+8: 9,15,21,3
  async scheduledScrape() {
    await this.trendQueue.add('refresh', { includeScraper: true }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 60000 },
    });
  }

  // 每日趨勢摘要 Email（每天 9:00 AM UTC+8）
  @Cron('0 1 * * *')  // UTC 01:00 = UTC+8 09:00
  async dailySummaryEmail() {
    const latestSnapshot = await this.prisma.trendSnapshot.findFirst({
      orderBy: { generatedAt: 'desc' },
      include: { topics: { orderBy: { relevanceScore: 'desc' }, take: 5 } },
    });
    if (!latestSnapshot) return;

    const subscribers = await this.prisma.trendUserSettings.findMany({
      where: { emailDailySummary: true },
      include: { user: { select: { id: true, email: true, displayName: true, tenantId: true } } },
    });

    for (const sub of subscribers) {
      await this.brevoService.sendTrendDailySummary(
        sub.user.email,
        sub.user.displayName,
        latestSnapshot.topics,
        latestSnapshot.aiAnalysis,
      );

      // 同時建立站內通知
      if (sub.notifyDailySummary) {
        await this.notificationService.send({
          userId: sub.user.id,
          tenantId: sub.user.tenantId,
          type: 'TREND_DAILY_SUMMARY',
          title: '📊 今日趨勢摘要',
          body: `今日 Top 5 趨勢已更新：${latestSnapshot.topics.map(t => t.title).join('、')}`,
          linkUrl: '/trends',
        });
      }
    }
  }

  // 14 天資料清理（每天凌晨 4:00 UTC+8）
  @Cron('0 20 * * *')  // UTC 20:00 = UTC+8 04:00
  async cleanupOldData() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    // Cascade delete: TrendSnapshot → TrendTopic
    const deleted = await this.prisma.trendSnapshot.deleteMany({
      where: { generatedAt: { lt: cutoff } },
    });
    this.logger.log(`Cleaned up ${deleted.count} snapshots older than 14 days`);

    // 清理 30 天前的通知
    const notifCutoff = new Date();
    notifCutoff.setDate(notifCutoff.getDate() - 30);
    await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: notifCutoff } },
    });
  }
}
```

### 6. Playwright Headless 重構

```typescript
// shared/playwright-pool.ts — 共用 Playwright 管理

import { chromium, Browser, BrowserContext } from 'playwright';

export class PlaywrightPool {
  private static browser: Browser | null = null;

  /**
   * 取得共用 browser instance（singleton for worker process）
   * 在 BullMQ worker 中使用，不會在主程序中開啟瀏覽器
   */
  static async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,                               // ← 改為 headless
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      });
    }
    return this.browser;
  }

  /**
   * 建立具備反偵測的 context
   */
  static async createStealthContext(browser: Browser): Promise<BrowserContext> {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'zh-TW',
      timezoneId: 'Asia/Taipei',
    });

    // 覆蓋 navigator.webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    return context;
  }

  static async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
```

### 7. YouTube Trending 資料源（新增）

```typescript
// trend-radar/sources/youtube-trending.source.ts

const YOUTUBE_TRENDING_RSS = 'https://www.youtube.com/feeds/videos.xml?chart=trending&gl=TW';

async function fetchYouTubeTrending(): Promise<RssFeedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(YOUTUBE_TRENDING_RSS, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CreatorPlatform/1.0' },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const xml = await res.text();
    // 使用 xml2js 解析 Atom feed
    const parsed = await parseStringPromise(xml, { trim: true, explicitArray: false });
    const entries = Array.isArray(parsed.feed?.entry) ? parsed.feed.entry : [parsed.feed?.entry].filter(Boolean);

    return entries.slice(0, 15).map(entry => ({
      title: typeof entry.title === 'string' ? entry.title : entry.title?._ || '',
      link: entry.link?.$?.href || '',
      pubDate: entry.published || entry.updated || undefined,
      source: 'YouTube Trending TW',
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## 通知基礎設施

### NotificationModule（全平台共用）

```
apps/api/src/modules/notification/
├── notification.module.ts
├── notification.service.ts        # CRUD + 批次發送
├── notification.controller.ts     # REST API
├── notification.gateway.ts        # WebSocket Gateway
└── dto/
    ├── create-notification.dto.ts
    └── notification-query.dto.ts
```

### WebSocket Gateway

```typescript
// notification.gateway.ts
@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
})
export class NotificationGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  // 用戶連線時以 JWT 認證，加入 user-specific room
  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    const payload = this.jwtService.verify(token);
    client.join(`user:${payload.sub}`);
  }

  // 推送通知給特定用戶
  sendToUser(userId: string, notification: NotificationResponse) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  // 推送未讀數更新
  sendUnreadCount(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('unread-count', { count });
  }
}
```

### NotificationService 核心方法

```typescript
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
    private readonly brevoService: BrevoService,
  ) {}

  async send(dto: {
    userId: string;
    tenantId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, any>;
    linkUrl?: string;
    sendEmail?: boolean;
    emailTo?: string;
  }): Promise<Notification> {
    // 1. 寫入 DB
    const notification = await this.prisma.notification.create({ data: { ... } });

    // 2. WebSocket 即時推送
    this.gateway.sendToUser(dto.userId, notification);

    // 3. 更新未讀數
    const unreadCount = await this.prisma.notification.count({
      where: { userId: dto.userId, isRead: false },
    });
    this.gateway.sendUnreadCount(dto.userId, unreadCount);

    // 4. Email（如果啟用）
    if (dto.sendEmail && dto.emailTo) {
      await this.brevoService.sendNotificationEmail(dto.emailTo, dto.title, dto.body);
    }

    return notification;
  }

  async sendBatch(items: SendNotificationDto[]): Promise<void> {
    // 批次建立通知 + 逐一推送 WebSocket
    for (const item of items) {
      await this.send(item);
    }
  }
}
```

---

## Brevo Email 整合

### BrevoModule

```
apps/api/src/modules/brevo/
├── brevo.module.ts
├── brevo.service.ts
└── templates/
    └── (Brevo 模板 ID 對應，模板在 Brevo 後台建立)
```

### BrevoService

```typescript
import * as Brevo from '@getbrevo/brevo';

@Injectable()
export class BrevoService {
  private readonly apiInstance: Brevo.TransactionalEmailsApi;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    this.apiInstance = new Brevo.TransactionalEmailsApi();
    this.apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
  }

  /**
   * 每日趨勢摘要
   */
  async sendTrendDailySummary(
    email: string,
    displayName: string,
    topics: TrendTopic[],
    aiAnalysis: string,
  ): Promise<void> {
    await this.apiInstance.sendTransacEmail({
      to: [{ email, name: displayName }],
      templateId: Number(this.config.get('BREVO_TEMPLATE_DAILY_SUMMARY')),
      params: {
        displayName,
        date: new Date().toLocaleDateString('zh-TW'),
        aiAnalysis,
        topics: topics.map(t => ({
          title: t.title,
          summary: t.summary,
          category: t.category,
          score: Math.round(t.relevanceScore * 100),
          url: t.url,
        })),
        dashboardUrl: `${this.config.get('FRONTEND_URL')}/trends`,
      },
    });
  }

  /**
   * 即時通知 Email（關鍵字命中 / 爆紅警報）
   */
  async sendNotificationEmail(
    email: string,
    title: string,
    body: string,
  ): Promise<void> {
    await this.apiInstance.sendTransacEmail({
      to: [{ email }],
      templateId: Number(this.config.get('BREVO_TEMPLATE_NOTIFICATION')),
      params: {
        title,
        body,
        dashboardUrl: `${this.config.get('FRONTEND_URL')}/trends`,
      },
    });
  }
}
```

### Brevo 模板需求

需要在 Brevo 後台建立 2 個交易型 Email 模板：

**模板 1: 每日趨勢摘要** (`BREVO_TEMPLATE_DAILY_SUMMARY`)
```
Subject: 📊 {{ params.date }} 趨勢雷達日報

Body:
- Header: 平台 Logo + 日期
- AI 分析摘要區塊
- Top 5 趨勢列表（title, summary, category badge, score bar）
- CTA: 「查看完整報告」→ dashboardUrl
- Footer: 取消訂閱連結
```

**模板 2: 即時通知** (`BREVO_TEMPLATE_NOTIFICATION`)
```
Subject: {{ params.title }}

Body:
- Header: 平台 Logo
- 通知標題
- 通知內容（body, 支援換行）
- CTA: 「查看詳情」→ dashboardUrl
- Footer: 取消訂閱連結
```

### 環境變數新增

```env
# Brevo
BREVO_API_KEY=xkeysib-xxxx
BREVO_TEMPLATE_DAILY_SUMMARY=1     # Brevo 模板 ID
BREVO_TEMPLATE_NOTIFICATION=2       # Brevo 模板 ID
BREVO_SENDER_EMAIL=noreply@yourplatform.com
BREVO_SENDER_NAME=創作者平台

# Frontend URL (for email CTA links)
FRONTEND_URL=http://localhost:3001
```

---

## 後端模組結構

```
apps/api/src/modules/trend-radar/
├── trend-radar.module.ts              # 升級：import BullMQ, NotificationModule, BrevoModule
├── trend-radar.controller.ts          # 升級：新增 keywords, settings, history endpoints
├── trend-radar.service.ts             # 升級：DB 持久化, fingerprint, phase 計算
├── trend-radar.processor.ts           # 新增：BullMQ Worker (refresh job)
├── trend-radar.cron.ts                # 新增：排程（刷新 + 清理 + 每日 Email）
├── trend-radar-viral.service.ts       # 新增：爆紅偵測 + 關鍵字比對
├── sources/                           # 新增：資料源抽象層
│   ├── base-source.ts                 # 共用 interface
│   ├── rss.source.ts                  # RSS feeds (8 sources)
│   ├── dcard-api.source.ts            # Dcard JSON API
│   ├── youtube-trending.source.ts     # YouTube Trending RSS
│   ├── tiktok-scraper.source.ts       # TikTok (Playwright headless)
│   └── threads-scraper.source.ts      # Threads (Playwright headless)
├── shared/
│   └── playwright-pool.ts             # Playwright singleton + stealth context
├── utils/
│   └── fingerprint.ts                 # SHA-256 fingerprint 生成
└── dto/
    ├── trend-query.dto.ts
    ├── create-keyword.dto.ts
    └── update-trend-settings.dto.ts

apps/api/src/modules/notification/     # 新增：全平台共用
├── notification.module.ts
├── notification.service.ts
├── notification.controller.ts
├── notification.gateway.ts            # WebSocket
└── dto/
    ├── create-notification.dto.ts
    └── notification-query.dto.ts

apps/api/src/modules/brevo/            # 新增：Email 服務
├── brevo.module.ts
└── brevo.service.ts
```

---

## 前端頁面

### 趨勢總覽頁面（升級）`app/(dashboard)/trends/page.tsx`

**元件結構**:
```
TrendsPage
├── TrendsHeader
│   ├── Title: "趨勢雷達"
│   ├── SettingsButton → /trends/settings
│   ├── RefreshButton (mutation: POST /trends/refresh)
│   └── RefreshStatus: "上次更新 10:00 AM ・ 下次 12:00 PM"
│
├── AiAnalysisCard              # 每日 AI 摘要（現有，維持）
│
├── FilterBar
│   ├── PlatformFilters: [全部] [YouTube] [TikTok] [Threads] [Dcard] [媒體]
│   ├── PhaseFilters: [🔥爆紅] [📈上升中] [🆕新趨勢] [📉衰退中]
│   └── CategoryFilters: (現有，維持)
│
├── TrendGrid
│   └── TrendCard[]
│       ├── CategoryBadge + PhaseBadge
│       ├── Title + Summary
│       ├── SourceTag + CrossPlatformBadge（跨平台熱點）
│       ├── RelevanceScoreBar
│       ├── SparklineChart (14天迷你走勢，recharts Sparkline)
│       ├── ContentIdeasCollapse
│       └── Actions: [查看詳情] [排入日曆]
│
└── EmptyState (現有，維持)
```

### 趨勢詳情頁面（新增）`app/(dashboard)/trends/[fingerprint]/page.tsx`

```
TrendDetailPage
├── BackLink → /trends
├── TrendHeader
│   ├── Title + PhaseBadge
│   ├── RelevanceScore + SourcePlatforms
│   └── FirstSeenAt + "已追蹤 N 天"
│
├── HistoryChart (recharts AreaChart)
│   ├── X: 日期 (14天)
│   ├── Y: relevanceScore (0-1)
│   └── 標記: Peak point, 今日
│
├── AiSummarySection
│   └── 趨勢摘要 + 來源連結
│
├── ContentIdeasSection
│   └── Idea cards with "排入日曆" button
│
└── ActionBar
    ├── [排入內容日曆 📅] → POST /content-strategy/calendar
    └── [忽略此趨勢]
```

### 趨勢設定頁面（新增）`app/(dashboard)/trends/settings/page.tsx`

```
TrendSettingsPage
├── KeywordSection
│   ├── KeywordTagInput (add/remove chips)
│   ├── KeywordList with hitCount + lastHitAt
│   └── QuotaIndicator (N/20)
│
└── NotificationPreferences
    ├── Toggle: 站內通知 — 關鍵字命中
    ├── Toggle: 站內通知 — 爆紅警報
    ├── Toggle: 站內通知 — 每日摘要
    ├── Divider
    ├── Toggle: Email — 關鍵字命中
    ├── Toggle: Email — 爆紅警報
    └── Toggle: Email — 每日摘要
```

### 通知中心（新增）`app/(dashboard)/notifications/page.tsx` + Header 元件

```
# Header 通知鈴鐺
NotificationBell (in layout header)
├── Badge: unreadCount (WebSocket real-time)
├── Dropdown:
│   ├── NotificationItem[] (latest 5)
│   └── "查看全部" → /notifications

# 通知頁面
NotificationsPage
├── Header: "通知" + [全部已讀] button
├── Tabs: [全部] [未讀]
└── NotificationList (infinite scroll, cursor-based)
    └── NotificationItem
        ├── TypeIcon (🔥/🎯/📊/📢)
        ├── Title + Body
        ├── TimeAgo
        └── UnreadDot
```

### 狀態管理（前端 hooks）

```typescript
// hooks/use-trends.ts
const useTrends = (params) =>
  useQuery(['trends', params], () => api.get('/v1/trends', { params }), { staleTime: 5 * 60 * 1000 });

const useRefreshTrends = () =>
  useMutation(() => api.post('/v1/trends/refresh'));

const useTrendHistory = (fingerprint: string) =>
  useQuery(['trend-history', fingerprint], () => api.get(`/v1/trends/${fingerprint}/history`));

// hooks/use-trend-keywords.ts
const useTrendKeywords = () =>
  useQuery(['trend-keywords'], () => api.get('/v1/trends/keywords'));

const useAddKeyword = () =>
  useMutation((dto) => api.post('/v1/trends/keywords', dto));

const useDeleteKeyword = () =>
  useMutation((id) => api.delete(`/v1/trends/keywords/${id}`));

// hooks/use-trend-settings.ts
const useTrendSettings = () =>
  useQuery(['trend-settings'], () => api.get('/v1/trends/settings'));

const useUpdateTrendSettings = () =>
  useMutation((dto) => api.patch('/v1/trends/settings', dto));

// hooks/use-notifications.ts
const useNotifications = (params) =>
  useInfiniteQuery(['notifications', params], fetchNotificationsPage);

const useUnreadCount = () =>
  useQuery(['unread-count'], () => api.get('/v1/notifications/unread-count'));

const useMarkRead = () =>
  useMutation((id) => api.post(`/v1/notifications/${id}/read`));

const useMarkAllRead = () =>
  useMutation(() => api.post('/v1/notifications/read-all'));

// WebSocket hook
const useNotificationSocket = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io('/notifications', { auth: { token: getAccessToken() } });

    socket.on('notification', (notif) => {
      queryClient.invalidateQueries(['notifications']);
      // 可選：toast 通知
    });

    socket.on('unread-count', ({ count }) => {
      queryClient.setQueryData(['unread-count'], { count });
    });

    return () => { socket.disconnect(); };
  }, []);
};
```

**shadcn/ui 元件新增需求**:
- Sparkline chart (recharts)
- AreaChart (recharts) — 走勢圖
- Switch (toggle for settings)
- Popover (notification dropdown)
- InfiniteScroll (通知列表)

---

## 測試案例

### Happy Path
- [ ] Cron 觸發 → BullMQ job 執行 → TrendSnapshot + TrendTopics 寫入 DB
- [ ] GET /trends → 返回最新 snapshot 的 topics
- [ ] GET /trends?category=科技 → 正確篩選
- [ ] GET /trends?phase=RISING → 正確篩選
- [ ] POST /trends/refresh → 新 snapshot 建立 + 返回最新資料
- [ ] GET /trends/:fingerprint/history → 14 天走勢正確
- [ ] POST /trends/keywords → 新增關鍵字成功
- [ ] DELETE /trends/keywords/:id → 移除成功
- [ ] PATCH /trends/settings → 更新通知偏好
- [ ] 關鍵字命中 → 站內通知建立 + WebSocket 推送
- [ ] 爆紅偵測 → 站內通知 + Email 發送（若啟用）
- [ ] 每日摘要 cron → Brevo Email 發送
- [ ] 14 天清理 cron → 過期 snapshot 刪除
- [ ] GET /notifications → cursor-based 分頁
- [ ] POST /notifications/:id/read → 標記已讀
- [ ] POST /notifications/read-all → 批次已讀

### Edge Cases
- [ ] 所有 RSS 來源失敗 → 僅 Playwright 資料，降級但不中斷
- [ ] OpenAI API 故障 → 返回原始 feed 標題（無 AI 分析），snapshot 仍寫入
- [ ] Playwright 被封鎖 → 跳過該平台，log warning，其餘正常執行
- [ ] 無 snapshot 存在（首次啟動）→ GET /trends 觸發同步刷新
- [ ] 同一關鍵字重複新增 → 409 Conflict
- [ ] 關鍵字超過 20 個上限 → 403 Forbidden
- [ ] 手動刷新 rate limit → 10 分鐘內第二次返回 429
- [ ] fingerprint 碰撞（理論極低）→ 走勢圖合併顯示，不影響功能
- [ ] 用戶無 TrendUserSettings → 使用預設值（全部開啟）
- [ ] Brevo 發送失敗 → log error，不影響站內通知
- [ ] WebSocket 斷線 → 前端 reconnect，下次 GET /notifications 補回

### Security
- [ ] 所有 endpoint 需 JWT 認證
- [ ] 關鍵字 CRUD 驗證 ownership（userId）
- [ ] 通知只能讀取自己的（userId 過濾）
- [ ] Brevo API key 不暴露至前端
- [ ] WebSocket 連線需 JWT 驗證
- [ ] 輸入驗證（class-validator）：keyword 長度 2-50, settings boolean only
- [ ] Rate limiting on POST /refresh

### PRD 驗收條件對應

| PRD AC | 對應 API / 流程 |
|--------|----------------|
| Story1-AC1 | GET /trends → 多平台 topics with sourcePlatform |
| Story1-AC2 | GET /trends?platform=xxx → 平台篩選 |
| Story1-AC3 | TrendTopic.isCrossPlatform + fingerprint 跨 snapshot 追蹤 |
| Story1-AC4 | Playwright headless in BullMQ worker, 不開啟瀏覽器 |
| Story2-AC1 | POST /trends/keywords (max 20) |
| Story2-AC2 | matchKeywords() AI 語意比對 + 站內通知 |
| Story2-AC3 | Notification.linkUrl → /trends?fingerprint=xxx |
| Story2-AC4 | TrendUserSettings.emailKeywordHit + BrevoService |
| Story3-AC1 | GET /trends/:fingerprint/history → 14 天走勢 |
| Story3-AC2 | TrendTopic.phase (RISING/DECLINING/PEAK/NEW) |
| Story3-AC3 | TrendTopic.firstSeenAt + phase=NEW 標記 |
| Story3-AC4 | cleanupOldData cron → 14 天自動清理 |
| Story4-AC1 | dailySummaryEmail cron → Brevo sendTransacEmail |
| Story4-AC2 | Template params: topics[], aiAnalysis, dashboardUrl |
| Story4-AC3 | TrendUserSettings.emailDailySummary toggle |
| Story4-AC4 | Brevo 模板含取消訂閱連結 |
| Story5-AC1 | detectViralTrends() → score 差值 ≥ 0.3 or 首次 ≥ 0.8 |
| Story5-AC2 | NotificationGateway.sendToUser() WebSocket push |
| Story5-AC3 | AI 生成推薦切入角度 + metadata 包含 fingerprint/score |
| Story5-AC4 | TrendUserSettings.emailViralAlert + BrevoService |
