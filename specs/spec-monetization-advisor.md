# AI 變現顧問 — 技術規格文檔

> Phase: 5 | Priority: P0 | Status: draft
> PRD: specs/prd-monetization-advisor.md

## 概述

整合 5 個收入管道（會員、商品、品牌合作、聯盟行銷、訂閱）數據，透過 GPT-4o 產出收入健診報告、變現建議、定價建議、收入預測。不新增 DB model，純讀取現有數據 + AI 分析。

## 依賴關係

- **前置模組**: Analytics, Membership, DigitalProduct, BrandDeal, Affiliate, Payment
- **使用的共用元件**: JwtAuthGuard, PrismaService, @CurrentUser()
- **外部服務**: OpenAI (GPT-4o, GPT-4o-mini)

## Database Models

不新增任何 model。純讀取現有數據。

## API Endpoints

### `GET /api/v1/monetize/health`
- **描述**: 收入健診報告 — 整合所有管道數據
- **認證**: Required
- **Query**: period ('30d' | '90d', default '30d')
- **Response** `200`:
```typescript
{
  period: { start: string; end: string };
  totalRevenue: number;
  previousTotalRevenue: number;
  growthRate: number;                    // MoM %
  channels: {
    membership: {
      revenue: number;
      percentage: number;
      mrr: number;
      activeMembers: number;
      churnRate: number;
      avgRevenuePerMember: number;
    };
    digitalProduct: {
      revenue: number;
      percentage: number;
      totalSales: number;
      avgOrderValue: number;
      topProduct: { name: string; sales: number } | null;
    };
    brandDeal: {
      revenue: number;
      percentage: number;
      activeDeals: number;
      avgDealValue: number;
      conversionRate: number;
    };
    affiliate: {
      revenue: number;
      percentage: number;
      totalClicks: number;
      conversionRate: number;
      topLink: { name: string; revenue: number } | null;
    };
    subscription: {
      revenue: number;
      percentage: number;
      plan: string;
    };
  };
  monthlyTrend: { date: string; total: number; membership: number; product: number; brand: number; affiliate: number }[];
}
```

### `GET /api/v1/monetize/advice`
- **描述**: AI 變現建議（含定價 + 策略推薦）
- **認證**: Required
- **Response** `200`:
```typescript
{
  suggestions: {
    id: string;
    title: string;
    description: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    category: 'PRICING' | 'GROWTH' | 'RETENTION' | 'NEW_CHANNEL' | 'OPTIMIZATION';
    steps: string[];
    estimatedImpact: string;
  }[];
  pricingAdvice: {
    membership: {
      currentTiers: { name: string; price: number; members: number }[];
      suggestions: string[];
    } | null;
    digitalProduct: {
      products: { name: string; price: number; sales: number }[];
      suggestions: string[];
    } | null;
  };
  unusedChannels: {
    channel: string;
    reason: string;
    estimatedMonthlyRevenue: string;
    setupDifficulty: 'EASY' | 'MEDIUM' | 'HARD';
    prerequisites: string[];
  }[];
  generatedAt: string;
}
```

### `GET /api/v1/monetize/forecast`
- **描述**: 收入預測（1-3 個月）
- **認證**: Required
- **Response** `200`:
```typescript
{
  hasEnoughData: boolean;
  forecast: {
    month1: { total: number; low: number; high: number; breakdown: Record<string, number> };
    month2: { total: number; low: number; high: number; breakdown: Record<string, number> };
    month3: { total: number; low: number; high: number; breakdown: Record<string, number> };
  } | null;
  assumptions: string[];
  generatedAt: string;
}
```

## 後端模組結構

```
apps/api/src/modules/monetize/
├── monetize.module.ts
├── monetize.controller.ts
├── monetize.service.ts
└── (no DTOs needed — all GET endpoints with query params)
```

## 前端

### 頁面 (`app/(dashboard)/monetize/page.tsx`)

```
MonetizePage
├── Tab: 收入總覽 → HealthPanel
│   ├── TotalRevenueCard (總收入 + 成長率)
│   ├── ChannelBreakdownCards (5 管道卡片)
│   ├── RevenueChart (月度趨勢 Recharts AreaChart)
│   └── ChannelDetailCards (各管道 KPI)
│
├── Tab: AI 建議 → AdvicePanel
│   ├── SuggestionCards (3-5 條建議)
│   ├── PricingAdviceSection (定價建議)
│   └── UnusedChannelsSection (未使用管道推薦)
│
└── Tab: 收入預測 → ForecastPanel
    ├── ForecastChart (3 個月預測 + 信心區間)
    ├── ForecastBreakdown (各管道預測分項)
    └── AssumptionsList (預測假設)
```

## 測試案例

### Happy Path
- [ ] GET /health → 返回完整收入健診
- [ ] GET /health → 各管道百分比總和 = 100%
- [ ] GET /advice → 返回 3-5 條建議
- [ ] GET /advice → unusedChannels 不包含已使用的管道
- [ ] GET /forecast → 有數據時返回預測
- [ ] GET /forecast → 數據不足時 hasEnoughData = false

### Edge Cases
- [ ] 新用戶無收入 → health 全部為 0，advice 推薦起步策略
- [ ] 只有一個管道有收入 → 正確計算百分比
- [ ] AI 生成失敗 → 返回 fallback 建議

### Security
- [ ] 所有端點需要認證 (401)
- [ ] 只能存取自己 tenant 的數據
