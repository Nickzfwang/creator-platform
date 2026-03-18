# 聯盟行銷追蹤模組 — 規格文檔

> Phase: 2 | Priority: P0 | Status: draft

## 概述
聯盟行銷追蹤模組讓創作者建立帶有追蹤碼的短網址，記錄點擊與轉換事件，並提供收益分析。每個連結自動產生唯一追蹤碼，點擊透過 302 redirect 計數，轉換透過外部回呼 API 記錄。

## 依賴關係
- **前置模組**: Auth (1.1), User (1.2)
- **使用的共用元件**: `JwtAuthGuard`, `PrismaService`, `CurrentUser`
- **外部服務**: 無直接外部 API（短網址由自有服務處理）

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: `AffiliateLink`, `AffiliateEvent`
相關 Enums: `AffiliateEventType`

## API Endpoints

### `POST /api/v1/affiliate/links`
- **描述**: 建立聯盟追蹤連結
- **認證**: Required
- **Request Body**:
```typescript
{
  originalUrl: string;         // 商品/目標 URL
  productName?: string;        // 商品名稱 (max 500)
  commissionRate?: number;     // 佣金比例 0-1
}
```
- **Response** `201`:
```typescript
{
  id: string;
  originalUrl: string;
  trackingCode: string;
  shortUrl: string;            // /r/{trackingCode}
  productName: string | null;
  commissionRate: number | null;
  clickCount: number;
  conversionCount: number;
  revenueTotal: number;
  isActive: boolean;
  createdAt: string;
}
```
- **Business Logic**: 產生 8 字元隨機追蹤碼（nanoid），組合短網址

### `GET /api/v1/affiliate/links`
- **描述**: 列出所有聯盟連結（cursor-based 分頁）
- **認證**: Required
- **Query**: cursor, limit (1-50, default 20), isActive (boolean), search (productName)
- **Response** `200`: `{ data: AffiliateLink[], nextCursor, hasMore }`

### `GET /api/v1/affiliate/links/:id`
- **描述**: 取得連結詳情（含近期事件統計）
- **認證**: Required
- **Response** `200`: AffiliateLink + recentEvents summary

### `PATCH /api/v1/affiliate/links/:id`
- **描述**: 更新連結（productName, commissionRate, isActive）
- **認證**: Required

### `DELETE /api/v1/affiliate/links/:id`
- **描述**: 停用連結（soft delete: isActive = false）
- **認證**: Required
- **Response** `204`

### `GET /r/:trackingCode`
- **描述**: 短網址重導向（公開，無需認證）
- **Response** `302` redirect to originalUrl
- **Business Logic**: 記錄 CLICK event（visitorId, ipHash, userAgent, referrer）

### `POST /api/v1/affiliate/events`
- **描述**: 回報轉換事件（外部系統回呼）
- **認證**: API Key 或 Public（含追蹤碼驗證）
- **Request Body**:
```typescript
{
  trackingCode: string;
  eventType: 'ADD_TO_CART' | 'PURCHASE' | 'REFUND';
  revenueAmount?: number;
  visitorId?: string;
  metadata?: Record<string, unknown>;
}
```

### `GET /api/v1/affiliate/stats`
- **描述**: 取得聯盟行銷彙總統計
- **認證**: Required
- **Query**: period (7d/30d/90d), linkId (optional)
- **Response** `200`:
```typescript
{
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  conversionRate: number;
  topLinks: { linkId, productName, clicks, conversions, revenue }[];
  dailyTrends: { date, clicks, conversions, revenue }[];
}
```

## 測試案例

### Happy Path
- [ ] 建立連結 → 產生唯一追蹤碼與短網址
- [ ] 點擊短網址 → 302 redirect + CLICK event 記錄
- [ ] 回報購買 → PURCHASE event + revenue 更新
- [ ] 統計 API → 正確彙總 clicks/conversions/revenue

### Edge Cases
- [ ] 重複追蹤碼 → 重新產生
- [ ] 停用的連結 → 點擊仍 redirect 但不計算
- [ ] REFUND event → 扣減 revenue
- [ ] 並發點擊 → clickCount 正確遞增
