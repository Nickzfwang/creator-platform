# AI 驅動開發實戰分享 — Creator Platform

> 以 Creator Platform 專案為主軸，分享如何用 Claude Code 從 0 建構完整 SaaS 平台

---

## 目錄

1. [專案簡介](#1-專案簡介)
2. [Claude Code 配置總覽](#2-claude-code-配置總覽)
3. [開發流程實戰拆解](#3-開發流程實戰拆解)
4. [AI 工具應用與搭配](#4-ai-工具應用與搭配)
5. [開發過程踩過的坑](#5-開發過程踩過的坑)
6. [Key Takeaways](#6-key-takeaways)

---

## 1. 專案簡介

### 什麼是 Creator Platform？

AI 驅動的創作者變現工具平台，整合：

- 影片剪輯（FFmpeg + AI 字幕）
- 社群排程發佈
- 知識庫 Bot
- 粉絲會員訂閱
- 品牌企劃媒合
- 趨勢雷達
- 數位商品販售
- Email 行銷

### 技術棧

| 層級 | 技術 |
|------|------|
| Monorepo | Turborepo + pnpm |
| 前端 | Next.js 14 (App Router) + TypeScript + shadcn/ui + Tailwind CSS |
| 後端 | NestJS — 模組化單體架構 |
| 資料庫 | PostgreSQL 16 + pgvector + Redis 7 (BullMQ) |
| ORM | Prisma（24 models, 18 enums） |
| AI | OpenAI (GPT-4o-mini + Whisper) + Anthropic Claude（雙 Provider） |
| 影片處理 | FFmpeg + fluent-ffmpeg |
| 認證 | JWT (access + refresh token) + Google OAuth |
| 支付 | Stripe (Subscriptions + Connect) |
| 測試 | Jest (SWC) + Playwright |
| 部署 | GitHub Actions CI/CD |

### 專案規模

```
74 commits / 1 contributor / 22 份規格文件 / 5 語系 i18n（939 keys）
```

---

## 2. Claude Code 配置總覽

### 2.1 CLAUDE.md — AI 的 Onboarding 文件

路徑：`/CLAUDE.md`

Claude Code 每次開啟對話都會自動載入這份檔案，等於讓 AI 先看完一份「新人到職手冊」再開始工作。

**包含的內容：**

| 區塊 | 作用 | 為什麼重要 |
|------|------|------------|
| 技術棧定義 | AI 不會推薦專案不用的框架 | 避免 AI 建議用 Express 而非 NestJS |
| 專案結構 | AI 知道檔案放哪裡 | `apps/web/` 是前端、`apps/api/` 是後端 |
| 命名規範 | 產出的 code 自動遵循規範 | 檔案 kebab-case、類別 PascalCase |
| API 規範 | 自動生成正確格式 | `/api/v1/{module}/{resource}`, cursor pagination |
| 設計決策 | AI 理解「為什麼」而非只是「怎麼做」 | 為何選 pgvector 而非 Pinecone |
| 協作原則 | **防止 AI 變成 Yes-Man** | 要求佐證、不附和、區分原創 vs 有據論點 |

**協作原則（重點摘錄）：**

```markdown
### 批判性協作
- 使用者論點缺乏依據時應主動指出，而非附和
- 有不同意見需明確提出並說明理由
- 區分「使用者原創主張」與「有外部佐證的論點」

### 產出責任
- 產出供使用者審查，不應誤導為可直接使用
- 提升品質上限，而非加速輸出數量
```

> 這段配置是非典型的——大多數人不會在 CLAUDE.md 裡要求 AI「挑戰你的想法」。但實測下來，這是避免 AI 產出垃圾的關鍵。

---

### 2.2 Custom Skills — 開發流程 Pipeline 化

路徑：`.claude/skills/`（共 8 個 Skill）

這是整個配置的**核心亮點**——把軟體開發流程拆成可重複執行的自動化 pipeline。

#### 總覽：`/feature` 一鍵驅動 7 階段

```
/feature {feature-name}
    │
    ├── Phase 1: /discuss     需求釐清（5 輪結構化提問）
    │
    ├── Phase 2: /prd         產品需求文件
    │                         ├── User Stories（Given/When/Then）
    │                         ├── 功能規格
    │                         ├── UI/UX 流程
    │                         └── 每個 Story ≥ 2 個可測試驗收標準
    │
    ├── Phase 3: /spec        技術規格書
    │                         ├── Prisma Model 設計
    │                         ├── API Endpoints（含 TypeScript 型別）
    │                         ├── Business Logic
    │                         └── 測試案例（對應每個驗收標準）
    │
    ├── Phase 4: /implement   模組化實作
    │                         ├── Prisma Schema → db:push → db:generate
    │                         ├── DTOs（class-validator）
    │                         ├── Service Layer
    │                         ├── Controller Layer
    │                         ├── Module Registration
    │                         └── Frontend Pages
    │
    ├── Phase 5: /review      Code Review（7 維度）
    │                         ├── 命名規範
    │                         ├── NestJS 標準
    │                         ├── OWASP 安全
    │                         ├── 多租戶隔離
    │                         ├── 型別安全
    │                         ├── 錯誤處理
    │                         └── 效能
    │
    ├── Phase 6: /test        單元測試
    │                         ├── Service.spec.ts
    │                         ├── Controller.spec.ts
    │                         └── Happy path + Error case
    │
    └── Phase 7: /e2e         E2E 測試
                              ├── Playwright
                              ├── 測試命名映射 AC 標準（AC1:, AC2:...）
                              └── 覆蓋率報告
```

#### 各 Skill 細節

**`/discuss` — 需求釐清**
- 進行 5 輪結構化提問：問題定義 → 範圍 → 用戶故事 → 技術考量 → 優先級
- 自動讀取現有架構文件作為背景知識
- 遵循批判性協作原則，不會盲目附和
- 輸出：結構化需求摘要

**`/prd` — 產品需求文件**
- 基於 discuss 結果產生完整 PRD
- 模板包含：背景、User Stories (Given/When/Then)、功能規格、UI/UX 流程、範圍、非功能需求、風險、里程碑
- 品質閘門：每個 Story 至少 2 個可測試的驗收標準
- 輸出：`specs/prd-{name}.md`

**`/spec` — 技術規格書**
- 從 PRD 轉譯為工程規格
- 內容：Prisma model 設計、API endpoints（含 TypeScript request/response 型別）、Business logic、前端頁面結構、測試案例
- 品質閘門：每個 PRD 驗收標準都必須有對應技術方案，未覆蓋的標記 `[待補]`
- 輸出：`specs/{phase}-{module}.md`

**`/implement` — 實作**
- 嚴格的實作順序：Schema → DTO → Service → Controller → Module → Frontend
- 前置條件檢查（依賴模組是否就緒）
- 自動執行 `pnpm db:push` + `pnpm db:generate`
- 強制遵循命名規範、API path 格式、tenantId 過濾、cursor pagination
- 收尾：`pnpm lint` + build 驗證
- 更新 `docs/DEVELOPMENT_PLAN.md` 進度

**`/review` — Code Review**
- 7 個維度的自動化檢查
- 安全掃描：SQL injection、XSS、認證授權、敏感資料 log、token 加密、硬編碼 secrets
- 問題分級：Critical / Warning / Info
- 可選：自動修復（需人工確認）

**`/test` — 單元測試**
- 使用 Jest + ts-jest + `@nestjs/testing` + `jest-mock-extended`
- 自動產生 Service 和 Controller 層測試
- 覆蓋：每個 public method 的 happy path + error case
- 輸出：`__tests__/{module}.service.spec.ts`、`__tests__/{module}.controller.spec.ts`

**`/e2e` — E2E 測試**
- 使用 Playwright，自動安裝（如未安裝）
- 測試命名映射 PRD 驗收標準（`AC1: 使用者可以...`）
- 選擇器優先順序：`getByRole` > `getByText` > `getByLabel` > `getByTestId`
- 支援共享 fixture（如 `auth.ts` 登入流程）
- 輸出覆蓋率報告：哪些 AC 已測、哪些未覆蓋

---

### 2.3 安全權限配置

路徑：`.claude/settings.local.json`

```
允許（Allow）:
  ✅ git, pnpm, npm, node, docker
  ✅ 檔案操作 (ls, mkdir, cp, mv, cat, head, tail)
  ✅ 偵錯工具 (lsof, kill, ps, grep)
  ✅ FFmpeg, Python3
  ✅ Claude Preview MCP 工具（截圖、DOM 檢查、互動測試）

禁止（Deny）:
  ❌ rm -rf /
  ❌ git push --force, git reset --hard
  ❌ sudo, chmod 777
  ❌ DROP TABLE, DELETE FROM（防 SQL 注入）
  ❌ 環境變數輸出（防洩漏 secrets）
```

> AI 有足夠的權限自主開發，但無法執行破壞性操作。

---

### 2.4 其他配置

| 配置 | 路徑 | 用途 |
|------|------|------|
| Status Line | `~/.claude/statusline-command.sh` | 即時顯示 model 名稱、context 使用率（≥85% 紅色警告）、API cost、git branch |
| Memory | `~/.claude/projects/.../memory/` | 跨對話記憶：記住剩餘任務、已完成功能、專案狀態 |
| Launch Config | `.claude/launch.json` | VS Code 一鍵啟動前後端 debug |
| Telegram Plugin | 全域設定 | 可透過 Telegram Bot 觸發 Claude 開發任務 |

---

## 3. 開發流程實戰拆解

### 3.1 從 0 到完整平台的三個 Phase

```
Phase 1 — 核心基礎建設 ✅
├── Auth（JWT + Refresh Token + Google OAuth）
├── Tenant（多租戶架構）
├── User Management
├── Video Upload + FFmpeg 處理
├── Social Platform 串接
├── Post Scheduler（BullMQ 排程）
├── Stripe 訂閱 + Connect
└── Dashboard

Phase 2 — 進階功能 ✅
├── Affiliate System（聯盟行銷）
├── Knowledge Base（知識庫 + pgvector）
├── Bot
├── Membership（粉絲會員）
└── Advanced Analytics

Phase 3 — 商業化 ✅
├── Brand Deals（品牌媒合）
├── White-label Tenant
├── API Gateway 擴充
└── AI 最佳發文時間預測

橫切面任務 ✅
├── i18n 國際化（5 語系、939 frontend keys、120 backend errors）
├── Sentry 錯誤追蹤
├── PWA 支援
├── GitHub Actions CI/CD
└── Dual AI Provider（OpenAI + Anthropic auto-fallback）
```

### 3.2 一個完整功能的開發流程（以 Trend Radar 為例）

#### Step 1：需求釐清

```
我：/discuss trend-radar

Claude：好的，讓我了解一下這個功能。第一輪提問：
1. Trend Radar 要解決什麼核心問題？
2. 目標用戶是誰？
3. 「趨勢」的資料來源是什麼？

我：（回答...）

Claude：第二輪，關於範圍界定...
（共 5 輪結構化討論）

Claude：以下是需求摘要：
- 問題：創作者需要即時掌握各平台熱門趨勢
- 範圍：YouTube + Instagram + TikTok 趨勢抓取 + AI 摘要
- 核心 User Story：...
```

#### Step 2：產品需求文件

```
我：/prd trend-radar

Claude：基於討論結果，產生 PRD...
→ 輸出 specs/prd-trend-radar.md（含 User Stories + 驗收標準）

我：（review PRD，確認或修改）
```

#### Step 3：技術規格

```
我：/spec trend-radar

Claude：基於 PRD，產生技術規格...
→ 輸出 specs/phase2-trend-radar.md
  - Prisma Model: TrendTopic, TrendSource, TrendAnalysis
  - API: GET /api/v1/trend/topics, POST /api/v1/trend/analyze
  - 測試案例對應每個 AC
```

#### Step 4：實作

```
我：/implement trend-radar

Claude：
1. ✅ 更新 prisma/schema.prisma（新增 3 個 model）
2. ✅ 執行 pnpm db:push + pnpm db:generate
3. ✅ 建立 DTOs（create-trend.dto.ts, trend-query.dto.ts）
4. ✅ 實作 TrendService
5. ✅ 實作 TrendController
6. ✅ 註冊 TrendModule
7. ✅ 建立前端頁面
8. ✅ pnpm lint 通過
9. ✅ 更新 DEVELOPMENT_PLAN.md
```

#### Step 5：Review + Test

```
我：/review apps/api/src/trend/
Claude：檢查 7 個維度... 發現 2 個 Warning, 1 個 Info
→ 自動修復（經確認）

我：/test trend
Claude：產生 + 執行 service.spec.ts, controller.spec.ts
→ 12 tests passed, 0 failed

我：/e2e trend-radar
Claude：產生 Playwright 測試，映射 PRD 驗收標準
→ AC1 ✅, AC2 ✅, AC3 ✅, AC4 ✅
```

**整個流程的關鍵：每一步都有文件產出，每一步都需要人工確認才進入下一階段。**

### 3.3 文件驅動的開發體系

```
docs/
├── PRODUCT_SPEC.md         (14.5 KB) — 產品全貌
├── SYSTEM_ARCHITECTURE.md  (17.2 KB) — 系統架構設計
├── DEVELOPMENT_PLAN.md     (27.7 KB) — 即時進度追蹤
├── ROADMAP.md              (6.7 KB)  — 功能路線圖
└── WORKFLOW.md             (9.4 KB)  — 開發流程指南

specs/ (22 個規格文件)
├── prd-trend-radar.md      — 產品需求
├── phase1-auth.md          — Auth 技術規格
├── phase1-video.md         — Video 技術規格
├── phase2-affiliate.md     — Affiliate 技術規格
└── ...                     — 每個模組都有對應規格
```

> 這些文件不是事後補寫的——它們是開發流程中自動產出的副產品，也是 AI 實作時的依據。

---

## 4. AI 工具應用與搭配

### 4.1 工具矩陣

| 工具 | 角色 | 使用場景 |
|------|------|----------|
| **Claude Code CLI** | 主力開發引擎 | Skills pipeline、code gen、review、test、debug |
| **Claude Code Memory** | 跨對話狀態管理 | 記住專案進度、未完成任務、技術決策 |
| **Claude Code MCP Preview** | 前端開發輔助 | 即時截圖、DOM 檢查、點擊互動測試 |
| **Claude Code Telegram Plugin** | 遠端觸發 | 透過手機 Telegram 啟動開發任務 |
| **OpenAI API (GPT-4o-mini)** | 產品內建 AI | 影片字幕 (Whisper)、內容摘要、文案生成 |
| **Anthropic API (Claude)** | 備援 AI Provider | 雙 Provider 架構 + auto-fallback |

### 4.2 搭配心法

#### 心法 1：開發用 Claude Code，產品用 OpenAI + Claude

```
開發時（Developer 視角）：
  Claude Code Skills → 產生 code、文件、測試

產品內（User 視角）：
  OpenAI API → 影片字幕、內容生成
  Anthropic API → 備援 Provider（auto-fallback）
```

兩者職責完全分離，不混用。

#### 心法 2：AI 寫初稿，人類做決策

```
           AI 產出          人類審查          進入下一步
PRD     →  初稿草案    →   確認/修改    →    ✅
Spec    →  技術方案    →   確認/修改    →    ✅
Code    →  實作程式    →   Review 通過  →    ✅
Test    →  測試案例    →   確認覆蓋率   →    ✅
```

> AI 是高效率的 junior developer，不是 decision maker。

#### 心法 3：用配置約束 AI 行為，而非用信任

```
❌ 錯誤做法：相信 AI 不會搞砸，出事再修
✅ 正確做法：
   - CLAUDE.md 定義規範 → AI 自動遵循
   - settings.local.json 設定權限 → 危險操作被阻擋
   - Skills 定義流程 → AI 按步驟執行
   - /review 品質閘門 → 自動化 Code Review
```

#### 心法 4：Memory 解決 Context 斷裂

```
對話 1：實作 Auth 模組
（對話結束，context 清空）

對話 2：實作 Payment 模組
Claude 透過 Memory 知道：
  - Auth 模組已完成
  - JWT 格式為 access + refresh token
  - Stripe 已整合
  → 不需要重複解釋專案背景
```

### 4.3 效率數據

| 指標 | 數值 |
|------|------|
| 總 Commits | 74 |
| 開發者 | 1 人 |
| 規格文件 | 22 份 |
| 後端模組 | 12+ 個 NestJS 模組 |
| Prisma Models | 24 個 model + 18 個 enum |
| i18n | 5 語系, 939 前端 keys, 120 後端 error messages |
| 測試 | 單元測試 + E2E 測試全覆蓋 |

---

## 5. 開發過程踩過的坑

### 坑 1：AI Yes-Man 問題

**問題：**
AI 天生傾向同意你的想法。你說「我覺得這個用 NoSQL 比較好」，AI 會回「對，NoSQL 確實很適合這個場景」——即使 PostgreSQL 才是正確選擇。

**解法：**
在 CLAUDE.md 寫入明確的協作原則：

```markdown
- 使用者論點缺乏依據時應主動指出，而非附和
- 所有主張需有外部來源佐證，無法佐證標注「[待驗證]」
- 禁止順著使用者的話直接歸納為結論
```

**效果：**
AI 會主動質疑不合理的設計決策，例如：「你提到用 NoSQL，但考慮到這個場景需要關聯查詢和事務支援，PostgreSQL 可能更合適。[參考：...]」

---

### 坑 2：Context Window 爆炸

**問題：**
大型 monorepo 的 code + 文件 + 對話歷史很容易填滿 context window，導致 AI 開始「遺忘」前面的內容，回答品質急遽下降。

**解法：**

| 策略 | 做法 |
|------|------|
| Skills 分階段 | 每個 Skill 只處理當前階段相關的檔案，不一次載入全部 |
| Memory 跨對話 | 把重要狀態（完成進度、技術決策）存入 Memory |
| Statusline 監控 | 即時顯示 context 使用率，≥85% 紅色警告，提醒你該開新對話 |
| 文件引用 | 讓 AI 讀 spec 文件而非在對話中重複描述需求 |

---

### 坑 3：生成 Code 風格不一致

**問題：**
不同對話中，AI 生成的 code 在命名、結構、錯誤處理上都不一樣。模組 A 的 service 長一個樣，模組 B 又長另一個樣。

**解法：**

1. **CLAUDE.md 定義嚴格規範**：命名規則、API path 格式、錯誤格式（RFC 7807）
2. **`/implement` Skill 內建固定順序**：Schema → DTO → Service → Controller → Module
3. **`/review` 強制 7 維度檢查**：每次實作完自動 review，不一致的地方立刻被抓出來
4. **Spec 作為實作依據**：AI 不是憑空生成，而是依照 spec 文件實作

---

### 坑 4：破壞性操作風險

**問題：**
AI 有 terminal 權限，理論上可以 `rm -rf /`、`git push --force`、`DROP TABLE`。

**解法：**

```json
// .claude/settings.local.json
{
  "deny": [
    "Bash(rm -rf /)",
    "Bash(git push --force)",
    "Bash(git reset --hard)",
    "Bash(sudo)",
    "Bash(chmod 777)",
    "Bash(DROP TABLE)",
    "Bash(DELETE FROM)"
  ]
}
```

另外也設定了 `skipDangerousModePermissionPrompt: false`（全域設定），確保危險操作會跳出確認提示。

---

### 坑 5：AI Provider 不穩定

**問題：**
產品內的 AI 功能（字幕生成、內容摘要）依賴 OpenAI API，但 API 偶爾會 timeout 或回傳異常，導致用戶端直接 crash。

**解法：**

1. **Dual AI Provider 架構**：同時整合 OpenAI + Anthropic Claude SDK
2. **Auto-fallback**：OpenAI 失敗時自動切換到 Anthropic
3. **Try-catch 全包覆**：所有 AI 呼叫都包在 try-catch 中，失敗時回傳 graceful error
4. **相關 commits**：
   - `60370bd feat: add Anthropic Claude SDK as dual AI provider with auto-fallback`
   - `1a1a0ca fix: wrap unhandled AI calls in try-catch during video upload`

---

### 坑 6：i18n 的規模化挑戰

**問題：**
5 個語系（zh-TW / zh-CN / en / ja / ko）x 939 個前端 key + 120 個後端 error = 大量翻譯工作，手動處理容易漏掉或不一致。

**解法：**
- 用 Claude Code 批次生成翻譯，以 zh-TW 為基底翻譯其他 4 個語系
- 分 5 個 Phase 執行，每個 Phase 處理特定範圍的 keys
- 後端 error messages 也納入 i18n，前端顯示 error 時用 i18n key 而非 hardcoded 字串
- 相關 commits 展示了系統化的執行過程

---

## 6. Key Takeaways

### 配置即流程

CLAUDE.md + Skills 把開發流程 codify 成可重複執行的 pipeline。不是每次都從零開始 prompt，而是建立一套標準化的 AI 開發工作流。

### AI 是 Junior Dev，不是 Architect

讓 AI 執行產出，人類負責審查和決策。每一步都有品質閘門，不是「AI 寫完就上線」。

### 防禦性配置不可少

權限管控（deny list）、協作原則（不附和）、品質閘門（/review）、安全檢查（OWASP）——這些配置是讓 AI 可靠的基礎。

### 文件驅動開發

PRD → Spec → Code → Test，每步都有可追溯的文件。文件不是事後補的，而是開發流程的一部分。

### 一人 + AI = 完整團隊

```
74 commits, 1 contributor
12+ NestJS modules, 24 Prisma models
22 spec documents, 5 locales
單元測試 + E2E 測試全覆蓋
```

一個人搭配 AI 工具鏈，可以建構出原本需要一個小團隊才能完成的 SaaS 平台。

---

> **核心觀點：AI 開發的重點不在「AI 多聰明」，而在「你怎麼配置和管理 AI」。好的配置讓 AI 變成可靠的開發夥伴，差的配置讓 AI 變成產出垃圾的加速器。**
