---
name: prd
description: >
  產出產品需求文檔 (Product Requirements Document)。
  適用於：需求確認後需要正式的產品規格、包含用戶故事和可測試驗收條件。
argument-hint: "<功能名稱>"
disable-model-invocation: true
---

# /prd — 產品需求文檔

產出面向產品的 PRD 文檔，包含用戶故事、驗收條件、UI/UX 流程。

## 使用方式
```
/prd $ARGUMENTS
```
其中 $ARGUMENTS 為功能名稱，例如：membership-tier, video-upload-v2

## 執行步驟

### 1. 收集輸入資料
- 讀取 `specs/discuss-$ARGUMENTS.md` 需求摘要（如果存在）
- 讀取 `docs/PRODUCT_SPEC.md` 了解現有產品定義
- 讀取 `docs/SYSTEM_ARCHITECTURE.md` 確認技術可行性
- 如果沒有需求摘要，先向使用者確認核心需求

### 2. 產出 PRD
建立 `specs/prd-$ARGUMENTS.md`，使用以下模板：

```markdown
# {功能名稱} — 產品需求文檔 (PRD)

> Status: draft | Owner: {name} | Priority: {P0/P1/P2}
> Created: {date} | Target: {target date or TBD}

## 1. 背景與目標
### 問題陳述
{描述當前痛點和機會}

### 目標
- {measurable goal 1}
- {measurable goal 2}

### 成功指標
| 指標 | 目前值 | 目標值 |
|------|--------|--------|
| {metric} | {current} | {target} |

## 2. 用戶故事與驗收條件

### Story 1: {title}
**作為** {角色}，**我想要** {功能}，**以便** {目的}

**驗收條件 (Acceptance Criteria):**
- [ ] AC1: Given {前提}, When {操作}, Then {預期結果}
- [ ] AC2: Given {前提}, When {操作}, Then {預期結果}

## 3. 功能規格

### 3.1 {功能模塊 1}
- **描述**: {what it does}
- **用戶流程**: 1. {step} 2. {step}
- **業務規則**: {rules}

## 4. UI/UX 流程
### 頁面清單
| 頁面 | 路由 | 描述 |
|------|------|------|
| {page} | `/{route}` | {description} |

### 核心流程
{用文字描述主要用戶操作流程，標注關鍵決策點}

## 5. 範圍定義
### In Scope (本次實作)
- {feature 1}

### Out of Scope (未來考慮)
- {deferred feature 1}

## 6. 非功能需求
- **效能**: {requirements}
- **安全**: {requirements}

## 7. 風險與未決事項
| 項目 | 影響 | 狀態 |
|------|------|------|
| {risk} | {impact} | 待確認 |

## 8. 里程碑
| 階段 | 內容 | 預估 |
|------|------|------|
| Phase 1 | MVP | TBD |
```

### 3. 品質檢查
- 每個 User Story 必須有至少 2 個驗收條件
- 驗收條件必須是可測試的（Given/When/Then 格式）
- 功能規格必須與現有 `docs/PRODUCT_SPEC.md` 不衝突
- 如有衝突或遺漏，主動提出

### 4. 確認與銜接
- 請使用者 review PRD
- 確認後提示：「PRD 已完成，你可以執行 `/spec $ARGUMENTS` 產出技術規格文檔」

## 與 /spec 的分工
| 面向 | /prd | /spec |
|------|------|-------|
| 讀者 | PM、設計師、利害關係人 | 工程師 |
| 內容 | What & Why | How |
| 格式 | 用戶故事、驗收條件 | API 設計、資料模型 |
| 語言 | 中文為主 | 技術內容英文為主 |
