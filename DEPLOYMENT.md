# Personal Feed Deployment

The public Feed and Daily Digest do not require sign-in. Supabase still provides the database and Row Level Security: anonymous visitors can read global Feed/Digest content, while personal state and operational logs remain private.

## 1. Create and migrate Supabase

1. Create a Supabase project and keep its project reference.
2. Authenticate the CLI and link this repository:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

3. From **Project Settings → API**, copy the project URL, publishable/anon key, and service-role key. The service-role key is server-only.
4. If personal actions are wanted, create the one allowed user under **Authentication → Users**, disable public signups, and configure the production callback URL as `https://YOUR_DOMAIN/auth/callback`.

The migrations seed four source-verified Discovery examples and grant anonymous read access only to topics, sources, source items, stories, tags, and digests. They do not expose profiles, story state, preferences, or job history.

## 2. Import the GitHub repository into Vercel

Import `jason125457/my_information_wedsite` as a Next.js project. Add these Production environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_URL` | Yes | Final HTTPS origin, without a trailing path |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only migrations/jobs/auth provisioning |
| `CRON_SECRET` | Yes | Random 16+ character cron bearer secret |
| `ALLOWED_EMAIL` | Personal actions only | The only email allowed to sign in |
| `OPENAI_API_KEY` | AI processing only | Server-side Responses API access |
| `OPENAI_MODEL_FAST` | AI processing only | Classification and summarization model ID |
| `OPENAI_MODEL_REASONING` | AI processing only | Ambiguous deduplication model ID |
| `OPENAI_MODEL_SEARCH` | Discovery only | Web Search model ID |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE only | Messaging API channel token |
| `LINE_TARGET_USER_ID` | LINE only | Recipient user ID |

Reddit and YouTube credentials are required only when those collectors are enabled. Copy their names from `.env.example`.

## 3. Deploy and verify

Deploy the `main` branch. Vercel reads `vercel.json` and invokes `/api/cron/digest` at `14:00 UTC` (`22:00 Asia/Taipei`). It sends `CRON_SECRET` as a bearer token.

Verify:

1. `/` opens without signing in and displays seeded stories.
2. `/digest` opens without signing in.
3. `/saved` redirects anonymous visitors to `/login`.
4. A Magic Link for `ALLOWED_EMAIL` unlocks Save, Read Later, History, and Not Interested.
5. Calling the cron endpoint without the bearer secret returns HTTP 401.
6. The Vercel deployment contains no `.env` file or service-role key in client bundles.

LINE is optional. If it is not configured, Digest generation succeeds and the job is marked partial. A failed LINE push never deletes a completed Digest.
