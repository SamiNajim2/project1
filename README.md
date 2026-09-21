# Strategy Agent

Strategy Agent turns a company brief and trusted evidence into a strategy project. It plans the research, searches the web with Claude's web-search tool, reads your PDFs, notes and URLs, and builds a cited report:

- Executive summary
- Market overview
- Competitor comparison table
- Customer segments
- Three strategic options with benefits, risks and requirements
- A recommendation you can edit
- A business case with labeled assumptions
- A 90-day action plan
- A consulting-style presentation outline (one-click copy)
- Sources with clickable links, plus the underlying evidence and quotes

Reports export to Markdown. A finished sample project (Oatly, US growth) is included, so you can demo the app without running an analysis.

Access is a paid subscription: people create an account (Supabase Auth), subscribe to **Strategy Agent Pro for $20/month** through Stripe Checkout (no free trial), and manage or cancel it in the Stripe customer portal.

## How it stays honest

- **Sources come only from the API's citation metadata.** The research step keeps a finding only when Claude's response attaches a citation: a web search result, a fetched page, your PDF (with page numbers) or your notes. URLs the model writes in plain text are never treated as sources.
- **Every claim is checked by the server.** Analysis steps may cite only evidence IDs from the research step. Unknown IDs are removed. A "fact" with no valid evidence is shown as **Unverified — more evidence needed**. A figure (%, $, million…) in an uncited judgment is flagged the same way.
- **Estimates and assumptions are labeled.** Business-case numbers trace to an assumption table, and each assumption is marked Sourced, Estimate or Assumption.
- **Gaps are explicit.** When the research could not answer something, the report says **More evidence needed**.

## Requirements

- Node.js 20.9 or later (22 or 24 recommended)
- An Anthropic API key with access to `claude-opus-5` and the web search and web fetch tools. Web search must be enabled for your organization in the [Claude Console](https://console.anthropic.com/settings/privacy).
- A Supabase project (auth and the `subscriptions` table)
- A Stripe account. Use sandbox (`sk_test_`) keys while testing.

## Run locally

```bash
git clone git@github.com:SamiNajim2/project1.git
cd project1
npm install
cp .env.example .env.local
```

Fill in `.env.local` (every variable is described in `.env.example` and under [Configuration](#configuration)).

Create the database table once: open the Supabase **SQL Editor**, paste `supabase/migrations/0001_subscriptions.sql` and run it.

Create the Stripe price once, in the same Stripe mode as your key:

```bash
curl https://api.stripe.com/v1/products -u "$STRIPE_SECRET_KEY:" -d name="Strategy Agent Pro"
curl https://api.stripe.com/v1/prices -u "$STRIPE_SECRET_KEY:" \
  -d product=prod_... -d unit_amount=2000 -d currency=usd \
  -d "recurring[interval]=month" -d lookup_key=strategy_agent_pro_monthly
```

Put the returned `price_...` ID in `STRIPE_PRICE_ID`. Then start the app:

```bash
npm run dev
```

Open http://localhost:3000, click **Get started**, create an account, and subscribe. In the Stripe sandbox, pay with card `4242 4242 4242 4242`, any future expiry date and any CVC. You land on your projects; the Oatly sample is already there. Click **Start a strategy project** to run your own. A full analysis takes about 5–8 minutes.

Stripe cannot send webhooks to `localhost`. Locally, the app confirms the subscription when Checkout returns (`/billing/success`), and the billing page re-reads it from Stripe, so everything works without webhooks. To receive webhooks locally, use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and put the `whsec_` secret it prints in `STRIPE_WEBHOOK_SECRET`.

### Other commands

```bash
npm run build            # production build
npm start                # serve the production build on port 3000
npm run lint             # ESLint
npm run typecheck        # TypeScript
npm run sample:generate  # re-run the pipeline for the sample brief (needs `npm run dev` running)
```

`npm run sample:generate` rewrites `src/data/sample-project.json` from a live run. It makes real API calls with web search, and needs a subscriber's session: sign in, copy the `Cookie` request header from the browser dev tools, and run it as `STRATEGY_AGENT_COOKIE='...' npm run sample:generate`.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Read only on the server, in `src/lib/server/anthropic.ts`. Never sent to the browser. |
| `ANTHROPIC_MODEL` | No | Overrides the model. Defaults to `claude-opus-5`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. Public. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key. Public; access is enforced by Row Level Security. |
| `SUPABASE_SECRET_KEY` | Yes | Server-only. Creates accounts and writes subscription status. |
| `STRIPE_SECRET_KEY` | Yes | Server-only. `sk_test_` in the sandbox, `sk_live_` in production. |
| `STRIPE_PRICE_ID` | Yes | The $20/month recurring price. |
| `STRIPE_WEBHOOK_SECRET` | In production | Signing secret of the webhook endpoint (`whsec_...`). |
| `STRIPE_PORTAL_CONFIGURATION_ID` | No | Customer portal configuration (`bpc_...`). Uses the account default when unset. |

`SUPABASE_DB_PASSWORD` and `DATABASE_URL` are only for running the migration from your machine; the app does not use them.

## Accounts and billing

- **Sign up and sign in** use Supabase Auth with email and password. Sign-up creates the account through `/api/auth/signup` with the email already confirmed, because Supabase's built-in email service only delivers to project team members. Configure custom SMTP in Supabase before relying on email confirmation or password-reset emails.
- **Paywall.** `/projects/*` and every call to the analysis API require a signed-in user with an `active` subscription. Signed-out visitors are sent to sign in (`src/proxy.ts`); signed-in users without a subscription are sent to `/billing`.
- **Subscription status** lives in the `subscriptions` table: one row per user with the Stripe customer, subscription, status and period end. Users can read only their own row (RLS); only the server writes it.
- **Keeping it in sync.** The Stripe webhook (`/api/stripe/webhook`) handles `checkout.session.completed` and `customer.subscription.*`, and always re-reads the subscription from Stripe so out-of-order events cannot corrupt it. The Checkout return page and the billing page also re-read from Stripe, and the paywall re-checks once a paid period has ended, so access stays correct even if a webhook is missed.
- **Manage or cancel** from the billing page, which opens the Stripe customer portal. Cancellation takes effect at the end of the paid period.

## Deploy to Vercel

1. Import the repository in Vercel (framework preset: Next.js).
2. Add the variables from [Configuration](#configuration) under **Settings → Environment Variables** for Production and Preview. Mark the secret ones Sensitive.
3. Deploy.
4. In Stripe, add a webhook endpoint for `https://<your-domain>/api/stripe/webhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Put its signing secret in `STRIPE_WEBHOOK_SECRET` and redeploy.

If Vercel Deployment Protection is on, Stripe's webhook calls are blocked. Either turn protection off for Production (the app has its own sign-in and paywall), or create a Protection Bypass for Automation and append `?x-vercel-protection-bypass=<secret>` to the webhook URL.

Each pipeline step runs in its own request with `maxDuration = 300` seconds and streams progress, so it fits within Vercel's default function limit.

## How it works

```
Browser (localStorage + IndexedDB for PDFs)
   │  POST /api/stages/{plan|research|market|strategy|business|summary}
   ▼
Next.js route handler ── streams NDJSON progress events ──► browser
   │
   ▼
Anthropic Messages API (claude-opus-5, adaptive thinking)
   • plan      structured output
   • research  web_search + web_fetch + PDF/notes documents with citations
   • market / strategy / business / summary
               structured output (Zod schemas), server-side citation checks
```

- The browser orchestrates the six steps and saves each result as it arrives. A failed or interrupted step can be retried without re-running earlier steps.
- Each step is a separate request, which keeps it under the serverless time limit. Progress streams as newline-delimited JSON.
- The brief, research plan and evidence form a shared prompt prefix that is cached across the four analysis steps.
- Requests opt into server-side refusal fallbacks (`fallbacks: "default"`). If a safety classifier declines a request, it is re-run on Anthropic's recommended fallback model instead of failing.
- Editing the recommendation updates the report and the export immediately. **Update them** regenerates the business case, the 90-day plan and the summary for your edited recommendation.

### Project layout

```
src/
  app/
    page.tsx                      Public landing page and pricing
    login/, signup/               Supabase email + password auth
    billing/                      Subscription status, Checkout return page
    projects/layout.tsx           Paywall: signed in + active subscription
    projects/page.tsx             Projects dashboard and sample
    projects/new/page.tsx         Brief form (PDF upload, URLs, notes)
    projects/[id]/page.tsx        Project workspace
    api/stages/[stage]/route.ts   Pipeline API (paywall, validation, streaming)
    api/auth/signup/route.ts      Account creation
    api/stripe/                   checkout, portal, webhook
  proxy.ts                        Session refresh and sign-in redirects
  components/                     UI: report sections, pipeline, editor, auth, billing
  lib/
    schemas.ts                    Zod schemas for every step's output
    types.ts                      Project and stage types
    markdown.ts                   Markdown export
    report.ts                     Citation index and helpers
    client/                       Browser storage and pipeline runner
    server/                       Anthropic client, prompts, evidence builder, citation checks, billing
    supabase/                     Browser, server and admin Supabase clients
  data/sample-project.json        Sample project generated by a real run
scripts/generate-sample.mjs       Regenerates the sample project
supabase/migrations/              SQL for the subscriptions table
```

## Limitations of this version

- Projects are stored in the browser where they were created: localStorage for reports, IndexedDB for PDFs. They are not tied to the account, so they do not follow a user to another device, and two accounts on the same browser see the same projects.
- There is no per-user usage limit. Each analysis spends Anthropic API credit, so watch usage before opening the product widely.
- Email confirmation and password reset need custom SMTP in Supabase (see [Accounts and billing](#accounts-and-billing)).
- PDFs are limited to 10 MB each and 20 MB in total.
