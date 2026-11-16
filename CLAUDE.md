@AGENTS.md

## Claude Code notes

- Shared rules live in AGENTS.md; priority is `PRODUCT.md` → `ARCHITECTURE.md` → AGENTS.md. This file only holds Claude-specific points.
- The "First Codex Task" section in AGENTS.md is finished history. Ignore it; current remaining work is in `IMPLEMENTATION_PLAN.md`.
- Before every commit run `npm run verify` (lint, typecheck, tests, build). CI runs the same plus a PostgreSQL RLS job (`tests/database/rls.sql`), so a new table or policy needs a matching RLS check there.
- Workflow: one branch per change → pull request → merge. Never push straight to `main`: a push to `main` deploys to Cloudflare Workers (`deploy.yml`) and is what the scheduled jobs run.
- Ask the user before anything that touches production: `npm run deploy`, running `job:*` scripts against the production Supabase project, changing GitHub Actions secrets or schedules, sending LINE messages.
- This repository is public. No secrets, project refs, personal email addresses or real user data in code, docs, tests, fixtures or commit messages.
- Everything stays on free tiers. Do not add a dependency or service that needs a payment method; watch the Gemini free-tier request budget when changing batching.
- Commits: English Conventional Commits (`feat:`, `fix:`, `chore:`), one behaviour change per PR, title written as the user-visible outcome.
- Talk to the user in Traditional Chinese; code, commits and these docs stay in English.
