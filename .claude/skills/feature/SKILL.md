---
name: feature
description: >
  AI Coding Workflow 總指揮 — 當使用者提出新功能需求時，自動引導走完從需求討論到 E2E 測試的完整開發流程。
  適用於：新功能開發、大型需求、完整開發週期。
argument-hint: "<功能名稱>"
disable-model-invocation: true
---

# /feature — AI Coding Workflow 總指揮

引導完成從需求到上線的完整開發流程。

## 使用方式
```
/feature $ARGUMENTS
```
其中 $ARGUMENTS 為功能描述，例如：會員等級系統, AI 自動字幕, 品牌媒合推薦

## 流程總覽
```
Phase 1: 需求討論 (/discuss)
Phase 2: 產品規格 (/prd)
Phase 3: 技術規格 (/spec)
Phase 4: 實作 (/implement)
Phase 5: Code Review (/review)
Phase 6: 單元測試 (/test)
Phase 7: E2E 測試 (/e2e)
```

## 執行步驟

### Phase 1: 需求討論
1. 向使用者提出結構化問題，釐清：
   - 這個功能要解決什麼問題？目標用戶是誰？
   - 核心 user stories（至少 3 個）
   - 功能邊界（包含什麼、不包含什麼）
   - 與現有模組的關聯（讀取 `docs/PRODUCT_SPEC.md` 和 `docs/SYSTEM_ARCHITECTURE.md` 比對）
   - 技術限制或偏好
2. 整理討論結果為結構化摘要
3. **暫停確認**：「需求確認完成，是否要產出 PRD？」

### Phase 2: 產品規格文檔
1. 基於 Phase 1 的討論結果，產出 `specs/prd-{feature-name}.md`
2. 內容包含：功能概述、用戶故事、驗收條件、UI/UX 流程、數據指標
3. **暫停確認**：「PRD 已產出，請 review 後確認。是否要產出技術 spec？」

### Phase 3: 技術規格文檔
1. 讀取 PRD，產出 `specs/{phase}-{feature-name}.md`
2. 內容包含：資料模型、API 設計、業務邏輯、前端頁面、測試案例
3. **暫停確認**：「技術 spec 已產出，請 review 後確認。是否開始實作？」

### Phase 4: 實作
1. 按照技術 spec 依序實作：DTOs → Service → Controller → Module → 前端
2. 每完成一個主要部分暫停回報進度
3. 實作完成後執行 `pnpm lint` 確認品質
4. **暫停確認**：「實作完成，是否要進行 Code Review？」

### Phase 5: Code Review
1. 對所有變更檔案執行完整 review（命名、安全、多租戶、型別、效能）
2. 列出問題清單並分級（Critical / Warning / Info）
3. 如有 Critical 或 Warning 問題，自動修復後再次 review
4. **暫停確認**：「Review 通過，是否要產生並執行測試？」

### Phase 6: 單元測試
1. 產生 service + controller 測試
2. 執行測試並回報結果
3. 如有失敗則修復後重跑
4. **暫停確認**：「單元測試全數通過，是否要跑 E2E 測試？」

### Phase 7: E2E 測試
1. 基於 PRD 驗收條件產生 Playwright E2E 測試
2. 執行測試並回報結果
3. 如有失敗則修復後重跑
4. **完成**：輸出整體摘要報告

## 流程控制規則
- 每個 Phase 結束後**必須暫停**等待使用者確認才進入下一步
- 使用者可以在任何暫停點說「跳過」來略過該 Phase
- 使用者可以說「從 Phase N 開始」來跳到指定階段
- 如果使用者說「快速模式」，則 Phase 5-7 自動執行不暫停
- 全程使用中文溝通，技術內容（code, API path, type）使用英文

## 進度追蹤
在每個 Phase 開始時，顯示當前進度：
```
[■■■□□□□] Phase 3/7: 技術規格 — 會員等級系統
```

## 輸出摘要
全部完成後，輸出：
- 產出的文件清單（PRD, spec, 測試檔案）
- 變更的程式碼檔案清單
- 測試結果摘要（通過/失敗）
- 後續建議（部署注意事項、相關模組影響）
