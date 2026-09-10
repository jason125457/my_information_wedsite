# Personal Feed

Personal Feed is a single-user AI information filter designed to surface a small number of important, relevant, and discoverable items without infinite-scroll mechanics.

## Project Status

The repository is currently at the specification stage. Implementation has not started.

## Start Here

Read these documents in order:

1. [PRODUCT.md](./PRODUCT.md) — product goals, behavior, scope, and success criteria
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — stack, data model, integrations, scheduling, and build order
3. [AGENTS.md](./AGENTS.md) — implementation constraints and the first Codex task

## Planned Stack

- Next.js, TypeScript, App Router
- Tailwind CSS and shadcn/ui
- Supabase PostgreSQL and Supabase Auth
- OpenAI Responses API
- Vercel and Vercel Cron
- LINE Messaging API

## MVP Principles

- Less, but better
- No infinite scroll
- Original sources always remain accessible
- AI filters and explains; it does not invent facts
- Discovery matters alongside current events
- Explicit feedback improves future ranking

## First Milestone

The first implementation milestone is a runnable vertical slice with project foundation, migrations, single-user authentication, a seeded Feed UI, and initial tests. External collectors and the full AI pipeline come afterward.

See the **First Codex Task** section in [AGENTS.md](./AGENTS.md) for the exact task brief.
