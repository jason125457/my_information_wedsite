# AGENTS.md

## Mission

Build Personal Feed according to, in priority order:

1. `PRODUCT.md`
2. `ARCHITECTURE.md`
3. This file

Before implementing a feature, read the relevant sections of `PRODUCT.md` and `ARCHITECTURE.md`. Do not redesign the product unless required to resolve a technical conflict. When a conflict exists, document the decision before implementation.

## Core Product Goal

Personal Feed exists to reduce information overload. Help the user consume less information while still discovering valuable content.

Do not optimize for engagement, infinite scrolling, content volume, or session length. Optimize for relevance, signal-to-noise ratio, clarity, discovery quality, and trustworthiness.

## MVP Scope

This is a single-user application. Do not build public registration, teams, social features, comments, followers, billing, SaaS infrastructure, or native mobile apps unless explicitly requested.

## Required Stack

Use Next.js, TypeScript, App Router, Tailwind CSS, shadcn/ui, Supabase PostgreSQL, Supabase Auth, OpenAI Responses API, Vercel, and LINE Messaging API. Do not replace a major architecture component without documenting why in `ARCHITECTURE.md`.

## Implementation Strategy

Work incrementally and keep the project runnable after every major phase. Preferred order:

1. Project foundation
2. Database migrations
3. Authentication
4. Feed UI with seeded mock data
5. Source collectors
6. AI classification and ranking
7. Deduplication
8. Real Feed
9. User states
10. Daily Digest
11. LINE notification
12. Discovery
13. Weekly Review

## UI Principles

The interface should feel calm, clean, information-focused, modern, and lightweight. Avoid clutter, excessive gradients, flashy animations, engagement tricks, and infinite scroll.

Every feed card must expose title, a 2–3 sentence summary, why it is recommended, source, publish time, topic, content type, and original URL. Actions are View Original, Read Later, Save, and Not Interested.

Read cards have reduced visual emphasis or a grey border. View Original marks the story as read and opens the source in a new tab.

## Source Integrity

Never fabricate URLs, sources, publication dates, quotes, or article facts. AI claims must be grounded in fetched source content. Distinguish official confirmation from community discussion; never present Reddit speculation as confirmed fact.

Avoid storing full copyrighted articles by default. Store metadata, URL, short excerpt, derived summary, citation metadata, and ranking signals. Full page text should normally be processed transiently and discarded. Never bypass paywalls, authentication, anti-bot protections, or publisher restrictions.

## External APIs

Prefer official APIs:

- Reddit: official API／OAuth
- Hacker News: official API
- YouTube: YouTube Data API; RSS may be a low-cost fallback
- OpenAI discovery: Responses API Web Search

Do not introduce scraping workarounds to avoid an API.

## Collector Design

Every collector must implement the common collector contract and return normalized candidates. Collectors must be independently testable. A collector failure must be logged and must not fail the entire ingestion job.

Expected flow:

```text
Fetch → Normalize → Return normalized candidates
```

## AI Design

Do not send every fetched item directly to an expensive model.

```text
Deterministic Filter
  → Cheap AI Classification
  → Ranking
  → Deduplication
  → Summarization
```

Model IDs must come from environment variables. Never hardcode a model version throughout the codebase. AI outputs that affect database state must use structured schemas and runtime validation.

## Ranking and Discovery

Ranking accounts for interest relevance, information value, importance, freshness, discussion popularity, discovery value, topic weight, and explicit feedback. Do not require every topic to appear every day. Quality is more important than quota.

Daily results target approximately 80% known sources and 20% discovery, but this is not a hard constraint. Discovery especially prioritizes AI tools and applications, Shoegaze, Dream Pop, Indie Rock, photography, and Taiwan photography locations. Old content may be recommended when discovery value is high.

## Deduplication

Do not show multiple cards for one event. Prefer one Story with multiple sources. The official or original source should normally be primary. Keep separate stories only when content provides genuinely different analysis or information.

## Feedback and Saved Content

Support Read, Save, Read Later, and Not Interested. Not Interested reasons are topic not interesting, low value／gossip, too technical, already knew this, poor source, and do not recommend this type.

Feedback must influence future ranking. Do not build a custom machine-learning recommender for MVP.

Saved items must remain searchable by keyword, topic, tag, date, and source. Do not implement embeddings, semantic search, RAG, or AI Q&A unless explicitly moving to V2.

## Scheduling and LINE

- Feed refresh: about every two hours
- Daily Digest: 22:00 Asia/Taipei
- Weekly Review: Sunday evening Asia/Taipei

Cron endpoints must verify `CRON_SECRET` and be idempotent. Running a job twice must not duplicate stories or digests.

LINE in MVP is notification-only. Do not build a conversational bot. The webhook may only support signature verification, platform verification, and initial user binding. Daily notifications link back to the Web App.

## Security

Never expose server secrets to the client and never commit `.env` files. Maintain `.env.example`. Use server-only environment variables, Supabase RLS, authenticated cron endpoints, LINE signature verification, and validation for all external input.

## Database

All schema changes must be migrations in `supabase/migrations/`. Do not rely on Dashboard-only schema changes.

## Error Handling and Observability

One failed source must not fail ingestion. Log source, error, timestamp, job, candidate count, and processed count. Failures must be visible in job history.

## Tests

Prioritize tests for URL normalization, ranking calculation, deduplication, collector normalization, feedback weighting, digest selection, authorization, RLS assumptions, idempotency, and LINE signature verification.

Do not spend excessive MVP time on snapshot tests for presentation-only UI.

## Code Quality

Prefer small modules, explicit types, readable names, and simple abstractions. Avoid premature microservices, unnecessary event buses, excessive dependency injection, and generic abstractions with only one use case.

## Documentation Rules

- Adding a source type requires a documentation update.
- Adding an environment variable requires updating `.env.example`.
- Architecture changes require updating `ARCHITECTURE.md`.
- Product behavior changes require updating `PRODUCT.md`.

## Definition of Done

A feature is complete when:

1. It works end to end.
2. Errors and important edge cases are handled.
3. Relevant database migrations exist.
4. Secrets are not exposed.
5. Relevant tests pass.
6. Documentation is updated.
7. The UI remains usable on desktop and mobile.

## First Codex Task

Read `PRODUCT.md`, `ARCHITECTURE.md`, and `AGENTS.md`, then:

1. Create a short implementation plan.
2. Scaffold the Next.js project.
3. Add Supabase integration.
4. Add database migrations for the initial data model and RLS.
5. Build the Feed UI using seeded mock data.
6. Implement single-user Magic Link authentication restricted by `ALLOWED_EMAIL`.
7. Add tests for the initial data model and critical access rules.
8. Update `README.md` with verified local setup instructions.

Do not implement every external source integration in the first task. Complete and verify the first vertical slice before continuing to ingestion.
