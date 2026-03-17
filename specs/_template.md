# {模組名稱} — 規格文檔

> Phase: {1/2/3} | Priority: {P0/P1/P2} | Status: {draft/approved/implemented}

## 概述
{一段話描述此模組的用途與核心價值}

## 依賴關係
- **前置模組**: {需要先完成的模組}
- **使用的共用元件**: {Guards, Interceptors, PrismaService 等}
- **外部服務**: {Stripe, OpenAI, AWS S3 等}

## Database Models
> 引用自 `apps/api/prisma/schema.prisma`

相關 Models: {Model1, Model2}
相關 Enums: {Enum1, Enum2}

## API Endpoints

### `METHOD /api/v1/{path}`
- **描述**: {endpoint 用途}
- **認證**: Required / Public
- **Request Body**:
```typescript
{
  field: type; // description
}
```
- **Response** `200`:
```typescript
{
  field: type;
}
```
- **Errors**: `400` / `401` / `404` / `409`

## Business Logic
### {流程名稱}
1. Step 1
2. Step 2
3. Step 3

**邊界條件**:
- {condition} → {behavior}

## 前端頁面

### {頁面名稱} (`app/{route}/page.tsx`)
- **功能**: {描述}
- **元件**: {shadcn/ui 元件列表}
- **狀態管理**: {local state / context / SWR}

## 測試案例

### Happy Path
- [ ] {test case 1}
- [ ] {test case 2}

### Edge Cases
- [ ] {edge case 1}
- [ ] {edge case 2}

### Security
- [ ] {security test 1}
