# Personal Feed Deployment

Everything runs on free tiers with **no payment method attached anywhere**. If a free quota runs out, the affected job fails for that run; nothing can be billed.

| Piece | Service | Free-tier notes |
| --- | --- | --- |
| Web App | Cloudflare Workers (via OpenNext) | ~10 ms CPU per request, 3 MiB gzipped bundle (currently ~1.6 MiB) |
| Database + Auth | Supabase Free | 500 MB; pauses after 7 idle days (scheduled jobs prevent this) |
| AI | Google AI Studio (Gemini API) | Small daily request quota; check it at aistudio.google.com/rate-limit |
| Scheduled jobs | GitHub Actions | Unlimited minutes for public repositories |
| Notification (optional) | LINE Messaging API | Free plan has a monthly message allowance; one push per day fits |

## 1. Supabase

1. Create a project at supabase.com (no card needed). Keep the project reference.
2. Link and push the migrations:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   `202610220002_explicit_api_grants.sql` adds the table grants that projects created after 2026-05-30 no longer receive by default.
3. From **Project Settings → API**, copy the project URL, the anon/publishable key, and the service-role key. The service-role key is server-only.
4. For personal actions (Save, Read Later, History): create the one allowed user under **Authentication → Users**, disable public signups, and add `https://YOUR_DOMAIN/auth/callback` to the redirect allowlist.

## 2. Gemini API key

1. Open aistudio.google.com and create an API key. **Do not** set up billing on the Google Cloud project it creates.
2. Open aistudio.google.com/rate-limit to see this project's real free-tier limits. Each ingestion run uses roughly 5–15 requests. Quotas are per model, so use Flash Lite models (500 requests/day each on the free tier as of 2026-10) and avoid Flash models (20/day).

## 3. GitHub Actions (scheduled jobs)

In the repository: **Settings → Secrets and variables → Actions**.

Secrets:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
| `GEMINI_API_KEY` | Google AI Studio key |
| `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_TARGET_USER_ID` | Optional |

Variables (optional; defaults shown in `.github/workflows/jobs.yml`): `GEMINI_MODEL_FAST`, `GEMINI_MODEL_QUALITY`, `GEMINI_MIN_INTERVAL_MS`, `APP_URL`.

Then run **Actions → Scheduled jobs → Run workflow** with `ingest` once to fill the feed. The schedule then runs ingestion every 2 hours, the Daily Digest at 22:07 Asia/Taipei, and the weekly review on Sundays at 21:07. A keepalive step stops GitHub from disabling the schedule after 60 quiet days.

## 4. Cloudflare Workers (web app)

**Current production setup (2026-10-23):** Worker `personal-feed` on the custom domain `www.shuns.site` (declared in `wrangler.jsonc`), deployed with wrangler from a local checkout. Worker secrets: `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAIL`. Supabase Auth `site_url` and redirect URLs are managed in `supabase/config.toml` (`npx supabase config push`).

**Automatic deploys:** `.github/workflows/deploy.yml` runs lint, typecheck, and tests, then builds and deploys on every push to `main`. It needs the repository secret `CLOUDFLARE_API_TOKEN` (created from the "Edit Cloudflare Workers" token template, scoped to this account and the `shuns.site` zone) and the variable `CLOUDFLARE_ACCOUNT_ID`.

To redeploy manually from a local checkout instead, build with only the public Supabase values in the environment, so no server secret from `.env.local` can be bundled:

```powershell
npx wrangler login
npm run deploy
```


Use **Workers & Pages → Create → Import a repository** and pick this GitHub repository (Workers Builds). Settings:

- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`
- Build variables (inlined into the browser bundle at build time): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

After the first deploy, open the Worker's **Settings → Variables and Secrets** and add the runtime values:

| Name | Type |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Text |
| `APP_URL` | Text, e.g. `https://feed.example.com` |
| `ALLOWED_EMAIL` | Text |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret |

Then **Settings → Domains & Routes → Add → Custom domain** with a hostname on your Cloudflare-managed domain.

To deploy from your own machine instead: `npx wrangler login`, then `npm run deploy` (needs `.env.local` with the `NEXT_PUBLIC_*` values for the build).

## 5. Verify

1. `/` opens without signing in and shows stories after the first ingestion run.
2. `/digest` opens without signing in.
3. `/saved` redirects anonymous visitors to `/login`.
4. A Magic Link for `ALLOWED_EMAIL` unlocks Save, Read Later, History, and Not Interested.
5. The Actions run log shows per-source counts; failed sources are listed without failing the whole run.

LINE is optional. Without it the digest is still created and the job is marked partial.
