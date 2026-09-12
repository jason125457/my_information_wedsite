# Personal Feed — Architecture

> Status: MVP draft
> Last updated: 2026-09-12
> Product requirements: [PRODUCT.md](./PRODUCT.md)

## 1. Architecture Goals

MVP 優先考慮單人使用、低維護、低成本、容易部署、來源可擴充、AI 模型可替換，以及避免過度工程化。

```text
Internet Sources
  → Collectors
  → Normalize / Deterministic Prefilter
  → AI Classify / Rank / Deduplicate / Summarize
  → Supabase PostgreSQL
  → Next.js Web App
  → Daily Digest / Weekly Review
  → LINE Notification
```

## 2. Technology Stack

### Application

- Next.js、TypeScript、App Router
- Tailwind CSS、shadcn/ui
- Server Actions 優先處理 UI mutations
- Route Handlers 處理 cron 與外部整合

MVP 不建立獨立 backend service。

### Data and Authentication

- Supabase PostgreSQL
- Supabase Auth Magic Link
- 僅允許 `ALLOWED_EMAIL`
- 禁止公開註冊
- 使用 Row Level Security（RLS）保護使用者資料

公開頁面採 anonymous read-only：Feed 與 Daily Digest 可由 anon role 讀取必要的 global content tables。Profiles、topic preferences、story state 與 job logs 不公開；Save、Read Later、History 與 Feedback 仍要求指定使用者登入。

### Hosting and Scheduling

- Vercel 部署 Next.js
- Vercel Cron 觸發排程
- Cron 一律以 UTC 設定；Asia/Taipei 22:00 對應 UTC 14:00

## 3. AI Layer

決策（2026-09-12）：單人 MVP 優先使用使用者現有的 Gemini API 免費額度，取代原訂 OpenAI Responses API。Gemini 由 server-side adapter 呼叫；模型名稱由環境變數提供，不在程式碼中寫死：

- `GEMINI_MODEL_FAST`：批次分類與初步評分（起始建議 `gemini-3.1-flash-lite`）
- `GEMINI_MODEL_REASONING`：摘要、推薦原因與少量模糊事件去重（起始建議 `gemini-3.5-flash-lite`）
- `GEMINI_MODEL_SEARCH`：未來 Discovery 的搜尋模型，現階段不要求設定

目前 Google AI Studio 顯示兩個 Flash-Lite 型號各 15 RPM、500 RPD；服務端必須以模型分別限速、批次分類、限制單次摘要與模糊去重呼叫數，避免 429 和 Vercel Hobby 單次五分鐘執行限制。額度可能調整，不能將其視為永遠保證。免費層資料使用政策需在部署說明中揭露。

未來 Discovery 可用 Gemini 的 Google Search grounding，但必須保存 URL、Title、Source 與 citation metadata，UI 必須顯示清楚且可點擊的原始來源；此功能尚未實作。

所有會影響資料庫狀態的 AI 輸出都必須使用 structured output，並通過 runtime schema validation。

## 4. Collector Contract

所有來源實作共同介面，並輸出相同的 normalized candidate：

```ts
interface Collector {
  readonly sourceType: SourceType;
  fetch(context: CollectorContext): Promise<CollectedItem[]>;
  normalize(item: CollectedItem): NormalizedCandidate | null;
}
```

每個 collector 必須可獨立測試。單一來源失敗時記錄錯誤並繼續處理，不得使整個 ingestion job 失敗。

## 5. Source Collectors

### RSS / Atom

來源由資料庫設定，不 hardcode。適用官方 Blog、科技媒體、音樂媒體、攝影 Blog 與新聞 RSS。

### Hacker News

使用 Hacker News 官方 API，抓取 top、best、new stories，再依 AI、Technology、Security 與 Startup topic profile 預先過濾。

### Reddit

只使用 Reddit 官方 API／OAuth 或官方允許的平台能力，不繞過限制或登入。MVP 保存標題、permalink、subreddit、score、發布時間、必要短 excerpt 與 derived AI metadata，不長期保存大量全文或 comments。

### YouTube

以 YouTube Data API 為主要來源，支援已知頻道新影片與主題探索。YouTube RSS 僅作低成本備援；不依賴 undocumented scraping。

### News and Finance

依序偏好官方 RSS／publisher RSS、正式 API、允許存取的公開網頁抽取。MVP 不建立大型新聞爬蟲。

### Gemini Search Grounding（規劃）

用於 Discovery，包括新 AI 工具、樂團、攝影景點、文章與潛在優質來源。

## 6. Article Extraction and Storage

RSS 只有摘要時，可對允許公開存取的文章頁面做 readable-content extraction，但不得繞過 paywall、登入、anti-bot 或網站限制。

完整文章只供暫時分析，預設不長期保存。資料庫主要保存 URL、metadata、短 excerpt、AI summary、citation metadata 與 ranking signals。

## 7. Feed Processing Pipeline

```text
Fetch
  → Normalize
  → URL / External ID Dedup
  → Deterministic Prefilter
  → AI Classification
  → Initial Ranking
  → Event Deduplication
  → Summary Generation
  → Persist Story
```

### Deterministic Prefilter

在 AI 前依發布時間、canonical URL、external ID、內容格式、基本 topic keyword、language 與最低 engagement 規則過濾，以控制成本。

### AI Classification

Structured output 最低欄位：

```json
{
  "topics": ["ai"],
  "interest_relevance": 5,
  "information_value": 4,
  "importance": 3,
  "freshness": 5,
  "discussion_popularity": 4,
  "discovery_value": 3,
  "content_type": "current"
}
```

### Ranking

基礎訊號包括 Interest Relevance、Information Value、Importance、Freshness、Discussion Popularity、Discovery Value、Topic Weight 與 Feedback Adjustment。

不同 topic 使用不同 weighting profile，且不要求每個 topic 每天都出現。

第一版先使用可重現的 deterministic ranking：六項 AI 訊號依 topic profile 做加權平均，Topic Weight 轉為 `0.8～1.2` 倍率，再套用有上下限的 rule-based feedback adjustment，最後分數限制在 `0～100`。此公式集中在單一 ranking module，未來可依實際使用資料調整。

### Feedback Adjustment

MVP 使用 rule-based feedback 加 LLM ranking。Save 增加相似內容權重；Not Interested 依 topic、content type、technical depth、source style 與 keywords 調整。不建立客製 ML recommender。

## 8. Event Deduplication

第一層使用 canonical URL、external ID 與 normalized title similarity。第二層只將模糊候選交給 reasoning model 判斷是否為同一事件。

第一層 title similarity 同時比較斷詞集合與 Unicode 字元 bigram，以涵蓋英文及中日文標題。只有落在模糊區間的候選使用 reasoning model，明確相同或明確不同者不產生 AI 成本。

相同事件建立一個 Story，透過 `story_sources` 關聯多個來源。主來源優先順序：Official → Original Reporting → Major Media → Community。提供明顯不同分析或新資訊的內容可獨立成 Story。

## 9. Summary Generation

每個 Story 產生 title、2～3 句 summary 與 1 句 `why_recommended`。摘要不得創造來源不存在的資訊，不得把 Reddit 推測寫成已確認事實，也不得隱藏來源性質。

## 10. Core Database Schema

所有 schema 變更必須使用 `supabase/migrations/` 下的 migration。

### `profiles`

- `id uuid primary key`，對應 auth user
- `email text unique not null`
- `line_user_id text null`
- `created_at timestamptz not null`

### `topics`

- `id uuid primary key`
- `slug text unique not null`
- `name text not null`
- `default_weight smallint not null check (default_weight between 1 and 5)`

### `topic_preferences`

- `profile_id uuid references profiles`
- `topic_id uuid references topics`
- `weight smallint not null check (weight between 1 and 5)`
- primary key: `(profile_id, topic_id)`

### `sources`

- `id uuid primary key`
- `name text not null`
- `type text not null`
- `url text not null`
- `reliability_type text not null`
- `primary_topic_id uuid null references topics`
- `is_discovery boolean not null default false`
- `is_active boolean not null default true`
- `config jsonb not null default '{}'`
- `created_at timestamptz not null`

### `raw_items`

- `id uuid primary key`
- `source_id uuid references sources`
- `external_id text null`
- `url text not null`
- `canonical_url text not null`
- `title text not null`
- `excerpt text null`
- `published_at timestamptz null`
- `fetched_at timestamptz not null`
- `raw_metadata jsonb not null default '{}'`
- unique constraints for source/external ID and canonical URL where appropriate

### `stories`

- `id uuid primary key`
- `title text not null`
- `summary text not null`
- `why_recommended text not null`
- `primary_topic_id uuid references topics`
- `content_type text check (content_type in ('current', 'discovery'))`
- six component scores plus `final_score`
- `primary_url text not null`
- `published_at timestamptz null`
- `created_at timestamptz not null`

### `story_sources`

- `story_id uuid references stories`
- `raw_item_id uuid references raw_items`
- `is_primary boolean not null default false`
- primary key: `(story_id, raw_item_id)`

### `story_state`

- `profile_id uuid references profiles`
- `story_id uuid references stories`
- `is_read`, `is_saved`, `is_read_later`, `is_not_interested` booleans
- `feedback_reason text null`
- `read_at`, `saved_at`, `updated_at` timestamptz
- primary key: `(profile_id, story_id)`

### Tags

- `tags(id, name)`
- `story_tags(story_id, tag_id)`

### Digests

- `digests(id, type, date, title, summary, created_at)` where type is `daily` or `weekly`
- `digest_stories(digest_id, story_id, position)`
- unique constraint on `(type, date)` for idempotency

### `job_runs`

- `id uuid primary key`
- `job_type text not null`
- `started_at`, `finished_at` timestamptz
- `status text not null`
- `items_processed integer not null default 0`
- `error_message text null`
- `metadata jsonb not null default '{}'`

## 11. Application Routes

| Route | Purpose |
| --- | --- |
| `/` | For You feed、分類切換、read/unread styling |
| `/topic/[slug]` | 單一分類 Feed |
| `/digest` | Daily Digest 列表 |
| `/digest/[date]` | 當日 Digest |
| `/saved` | 收藏知識庫與篩選 |
| `/read-later` | 稍後閱讀 |
| `/history` | 閱讀紀錄 |
| `/weekly` | Weekly Review |
| `/settings` | Topic、通知、來源與 Digest 設定 |
| `/settings/jobs` | 最近 jobs、處理數與錯誤 |

Feed 不使用 infinite scroll，採 Load More 或分頁。

## 12. Route Handlers and Server Actions

外部／排程 endpoints：

- `GET|POST /api/cron/ingest`
- `GET|POST /api/cron/digest`
- `GET|POST /api/cron/weekly`
- `POST /api/line/webhook`

Cron endpoints 必須驗證 `CRON_SECRET` 並具備 idempotency。UI 的 read、save、read-later 與 feedback mutation 優先使用 Server Actions；若需要公開 API，再增加對應 Route Handler。

## 13. Scheduling

| Job | Asia/Taipei | UTC cron |
| --- | --- | --- |
| Feed refresh | 每 2 小時 | `0 */2 * * *` |
| Daily Digest | 每天 22:00 | `0 14 * * *` |
| Weekly Review | 週日 21:00 | `0 13 * * 0` |

目前部署於 Vercel Hobby，該方案不接受單一 Cron 每日執行多次。因此正式部署暫以 `0 12 * * *`（台北 20:00）每天收集一次，預留時間給 22:00 Digest；每兩小時更新仍是產品目標，日後可改用合適的排程服務或升級方案。Hobby Cron 可能在指定小時內延後觸發，不能保證準點。這是部署限制，不改變無低品質內容填充的產品原則。

Daily Digest 流程：過去 24 小時 Stories → 移除 Not Interested → 套用 feedback → deduplicate → rank → 選出約 15～20 則 → 儲存 Digest → 推送 LINE。若只有 11 則達標，就只保存 11 則。

Known／Discovery 的 80／20 以每日結果為目標，不要求每次 refresh 精準符合。

## 14. LINE Integration

使用 LINE Messaging API。MVP 是通知系統，不是聊天 Bot。

`/api/line/webhook` 僅用於簽章驗證、LINE webhook verification 與首次取得／綁定 `userId`。Digest 完成後推送文章數量、分類摘要與 Web App 連結。

LINE 發送失敗要寫入 job log，但不回滾已成功產生的 Digest。

## 15. Environment Variables

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL_FAST=
GEMINI_MODEL_REASONING=
GEMINI_MODEL_SEARCH=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_EMAIL=

YOUTUBE_API_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=

LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_TARGET_USER_ID=

APP_URL=
CRON_SECRET=
```

所有 secret 僅能在 server side 使用，不得傳送到 browser 或提交至 Git。

## 16. Cost Control

目標漏斗：

```text
500 fetched candidates
  → deterministic filter: ~150
  → cheap AI classification: ~40 relevant
  → dedupe
  → summarize ~20–30
  → select ~15–20 for Daily Digest
```

實際門檻應可設定並以 job metrics 校正，不能把所有 fetched items 直接送進昂貴模型。

## 17. Failure Handling and Observability

- Collector 逐來源 `try/catch`，錯誤記錄後繼續。
- Job 記錄 source、error、timestamp、job、candidate count 與 items processed。
- `/settings/jobs` 顯示最近 ingestion、digest、LINE push、處理數與錯誤。
- MVP 不引入大型監控平台。
- 重跑 cron 不得重複建立 raw items、stories 或 digests。

## 18. Repository Structure

```text
personal-feed/
├── AGENTS.md
├── PRODUCT.md
├── ARCHITECTURE.md
├── README.md
├── app/
│   ├── api/
│   ├── digest/
│   ├── saved/
│   ├── read-later/
│   ├── history/
│   ├── settings/
│   ├── topic/
│   └── page.tsx
├── components/
│   ├── feed/
│   ├── digest/
│   └── ui/
├── lib/
│   ├── ai/
│   ├── collectors/
│   ├── ranking/
│   ├── dedupe/
│   ├── line/
│   ├── supabase/
│   └── utils/
├── prompts/
├── supabase/migrations/
├── tests/
├── vercel.json
├── package.json
└── .env.example
```

## 19. MVP Build Order

1. Foundation：Next.js、Supabase、authentication、database、basic UI
2. Ingestion：RSS、Hacker News、Reddit、YouTube
3. AI Pipeline：classify、rank、dedupe、summary
4. Personal Feed：For You、topic pages、read state、read later、saved、feedback
5. Digest：Daily Digest、LINE、cron
6. Discovery：Gemini Search Grounding 與約 20% exploration
7. Weekly Review：reading analytics、saved analytics、weekly AI summary

## 20. Architecture Principle

若一項功能沒有直接改善 Finding、Filtering、Understanding 或 Saving information，就不應進入 MVP。
