# AI 粉絲互動管理 — 技術規格文檔

> Phase: 5 | Priority: P0 | Status: draft
> PRD: specs/prd-fan-interaction.md

## 概述

匯入粉絲留言後，AI 自動分類（6 類別）+ 情緒分析，並可代擬回覆（含 RAG 知識庫整合）。前端提供留言管理、代擬回覆、互動統計儀表板。

## 依賴關係

- **前置模組**: Auth, AI, KnowledgeBase（RAG 搜索）
- **使用的共用元件**: JwtAuthGuard, PrismaService, @CurrentUser()
- **外部服務**: OpenAI (GPT-4o-mini)

## Database Models

### 新增 Enums

```prisma
enum CommentCategory {
  POSITIVE
  NEGATIVE
  QUESTION
  COLLABORATION
  SPAM
  NEUTRAL
}

enum CommentPriority {
  HIGH
  MEDIUM
  LOW
}
```

### 新增 Model: FanComment

```prisma
model FanComment {
  id              String          @id @default(uuid()) @db.Uuid
  userId          String          @map("user_id") @db.Uuid
  tenantId        String          @map("tenant_id") @db.Uuid
  platform        String?         @db.VarChar(50)
  authorName      String          @map("author_name") @db.VarChar(255)
  authorAvatar    String?         @map("author_avatar")
  content         String
  publishedAt     DateTime?       @map("published_at")
  sourceUrl       String?         @map("source_url")
  category        CommentCategory @default(NEUTRAL)
  sentiment       Float           @default(0)           // -1 to 1
  priority        CommentPriority @default(LOW)
  isReplied       Boolean         @default(false) @map("is_replied")
  aiReply         String?         @map("ai_reply")
  finalReply      String?         @map("final_reply")
  repliedAt       DateTime?       @map("replied_at")
  metadata        Json?
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  user            User            @relation(fields: [userId], references: [id])
  tenant          Tenant          @relation(fields: [tenantId], references: [id])

  @@index([tenantId, userId, category])
  @@index([tenantId, userId, isReplied])
  @@index([createdAt(sort: Desc)])
  @@map("fan_comments")
}
```

## API Endpoints

### `POST /api/v1/interactions/comments/import`
- 手動匯入留言（單則或批次）
- Body: `{ comments: { authorName, content, platform?, publishedAt?, sourceUrl? }[] }`
- Response: `{ imported: number, classified: number }`

### `GET /api/v1/interactions/comments`
- 列出留言（cursor-based，可篩選 category/priority/isReplied）
- Query: cursor, limit, category?, priority?, isReplied?, search?

### `POST /api/v1/interactions/comments/:id/generate-reply`
- AI 代擬回覆（2-3 個草稿）
- Body: `{ knowledgeBaseId?: string, tone?: 'friendly' | 'professional' | 'casual' }`
- Response: `{ replies: { tone: string, content: string }[] }`

### `PATCH /api/v1/interactions/comments/:id`
- 更新留言（標記已回覆、存最終回覆）
- Body: `{ finalReply?, isReplied?, category? }`

### `DELETE /api/v1/interactions/comments/:id`
- 刪除留言

### `GET /api/v1/interactions/stats`
- 互動統計（分類統計 + 情緒趨勢）
- Query: period ('7d' | '30d')

## 後端模組結構

```
apps/api/src/modules/interactions/
├── interactions.module.ts
├── interactions.controller.ts
├── interactions.service.ts
└── dto/
    ├── import-comments.dto.ts
    ├── list-comments-query.dto.ts
    ├── generate-reply.dto.ts
    └── update-comment.dto.ts
```
