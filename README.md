# Finance Analyst

Finance Analyst helps finance teams turn Excel and CSV exports into management-ready reporting where every number can be traced to the cell it came from.

It covers the whole workflow:
1. Import files.
2. Map columns to a standard finance model.
3. Validate the data.
4. Analyze variances.
5. Forecast base, upside and downside scenarios.
6. Calculate cash runway.
7. Build the MRR bridge.
8. Draft an investor update and the finance section of a board pack.
9. Sign off the review, then export.

Access is a paid subscription. People create an account (Supabase Auth), subscribe to **Finance Analyst Pro for $20/month** through Stripe Checkout (no free trial), and manage or cancel it in the Stripe customer portal.

## What it produces

- Data-quality report: required fields, duplicates, missing values, period gaps, currency mismatches, and reconciliation checks
- Actual-versus-budget and actual-versus-prior variance tables (month and year to date), in amount and percentage
- Base, upside and downside forecasts from editable drivers
- Cash runway for each scenario
- MRR bridge: starting MRR + new + expansion − contraction − churn = ending MRR, with GRR, NRR and ARR
- Investor update draft
- Finance section of a board pack: KPIs, variances, outlook, risks and actions
- Verification and assumptions register
- Exports: the full report as Markdown, and every analysis table as CSV

## Finance rules, and how they are enforced

| Rule | Implementation |
| --- | --- |
| Calculations never happen in the language model | All figures come from pure TypeScript functions in `src/lib/calc/`. The model cannot write a number: it can only reference figures by ID, as `{{F:id}}`, and the app inserts the value. Any number the model types itself is flagged **UNVERIFIED**. |
| Raw data is never modified silently | Files are stored exactly as parsed. Mapping produces a separate standard dataset. Every conversion, such as `"(1,234)"` read as −1234 or a sign flip, is logged in the data-quality report. |
| Every figure shows its formula and source | Each figure carries its formula, the figures it is calculated from, and its source file, sheet, column, period and Excel rows. Click any number to open its trace. |
| Actuals, forecasts and assumptions stay separate | Actuals are ink, budget and prior are muted, forecasts are italic blue, and assumptions are violet, everywhere including the exports. |
| Totals are reconciled before any narrative | P&L totals are the sum of the lines. Reported subtotals such as "Total revenue" are compared with those sums, never added in. Cash rolls forward month by month. The MRR bridge must match reported ending MRR. |
| UNVERIFIED on anything untraceable | A figure is unverified if it has no source, touches data with a validation error, fails reconciliation, or depends on an unverified figure. Unverified figures are excluded from narrative drafting. |
| No invented figures, explanations or causes | Missing comparisons stay empty and are never assumed to be zero. The narrative may state a cause only if it appears in the management commentary you enter; causal language is flagged for review. |
| Human review before export | Exports stay locked until a reviewer completes a checklist and signs off. Any later change to the data, assumptions or drafts invalidates the sign-off. |

## Requirements

- Node.js 22.12 or later (Node 24 recommended)
- An Anthropic API key, used only for narrative drafting
- A Supabase project, for accounts and the `subscriptions` table
- A Stripe account. Use sandbox (`sk_test_`) keys while testing.

## Run locally

```bash
git clone git@github.com:SamiNajim2/project1.git
cd project1
npm install
cp .env.example .env.local   # then fill in every value (see below)
npm run dev
```

**One-time setup**

1. **Database.** In the Supabase **SQL Editor**, run `supabase/migrations/0001_subscriptions.sql`. It creates one row per user holding their Stripe customer, subscription and status, with Row Level Security: users can read only their own row, and only the server writes.
2. **Stripe price.** Create the $20/month price in the same Stripe mode as your key, and put the returned `price_...` ID in `STRIPE_PRICE_ID`:

   ```bash
   curl https://api.stripe.com/v1/products -u "$STRIPE_SECRET_KEY:" -d name="Finance Analyst Pro"
   curl https://api.stripe.com/v1/prices -u "$STRIPE_SECRET_KEY:" -d product=prod_... \
     -d unit_amount=2000 -d currency=usd -d "recurring[interval]=month" -d lookup_key=finance_analyst_pro_monthly
   ```

**Try it**

1. Open http://localhost:3000 and click **Get started** to create an account.
2. Click **Subscribe for $20/month**. In the Stripe sandbox, pay with card `4242 4242 4242 4242`, any future expiry date and any CVC.
3. On **Your projects**, click **Open the sample project**. The sample loads four fictional files for "Brightwave Analytics" through the normal import path. Walk through the steps in the left sidebar. In step 8, click **Draft with AI**; each draft takes about 30 seconds. In step 9, sign off and export.

The sample includes two deliberate data-quality problems:
- February's reported ending MRR is $250 higher than its bridge. The reconciliation check fails and February's MRR figures are marked UNVERIFIED.
- March's investing cash flow is blank. This is reported as a warning.

### Commands

```bash
npm run dev               # development server on http://localhost:3000
npm test                  # unit and workflow tests (Vitest)
npm run typecheck         # TypeScript
npm run lint              # ESLint
npm run build && npm start
npm run samples:generate  # regenerate public/samples/*
```

### Tests

`npm test` runs these suites:

| Test file | What it covers |
| --- | --- |
| `src/lib/calc/variance.test.ts` | Variance amount, percentage and direction. Totals, reconciliation failures, missing comparisons and year to date. |
| `src/lib/calc/runway.test.ts` | Average burn, runway, cash-zero month and the forecast projection. |
| `src/lib/calc/mrr.test.ts` | Bridge maths, retention, reconciliation against the reported ending, continuity between months, and missing movements. |
| `src/lib/parsing.test.ts` | Period and amount parsing, and the narrative number guard. |
| `src/lib/sample.test.ts` | End to end on the sample files: parse, detect, map, validate, analyze. |

## Using your own files

- **P&L:** one sheet per scenario (actual, budget, prior year) with months across columns, or one row per amount with period and amount columns. Title rows above the header are detected automatically.
- **Cash:** one row per month with a closing cash balance. Opening balance, net cash flow and cash-flow components are optional; when present they are reconciled.
- **MRR:** one row per month with new, expansion, contraction and churned MRR. Starting and reported ending MRR are optional; when present they are reconciled.
- **Drivers:** rows named "Revenue growth", "Gross margin", "Opex growth" and "Other cash flow", with Base, Upside and Downside columns. Percentages are percent points, so 3 means 3%.

Any other currency than the reporting currency is flagged and never converted.

## Accounts and billing

- **Sign up and sign in** use Supabase Auth with email and password. Accounts are created as already confirmed through `/api/auth/signup`, because Supabase's built-in email service only delivers to project team members. Configure custom SMTP in Supabase before relying on confirmation or password-reset emails.
- **Paywall.** The public pages are `/` (landing and pricing), `/login` and `/signup`.
  - `/projects/*` and the AI drafting endpoint require a signed-in user with an active subscription to the `STRIPE_PRICE_ID` price.
  - Signed-out visitors are sent to sign in (`src/proxy.ts`).
  - Signed-in users without a subscription are sent to `/billing`.
  - Subscriptions to other products on the same Stripe account never grant access.
- **Keeping status in sync.** The Stripe webhook (`/api/stripe/webhook`, signature-verified) handles `checkout.session.completed` and `customer.subscription.*`, and always re-reads the subscription from Stripe. The Checkout return page and the billing page also re-read from Stripe, and the paywall re-checks once a paid period ends, so access stays correct even if a webhook is missed.
- **Manage or cancel** from the billing page, which opens the Stripe customer portal. A cancellation takes effect at the end of the paid period.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Narrative drafting (server-only) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase Auth in the browser and server |
| `SUPABASE_SECRET_KEY` | Yes | Server-only: creates accounts and writes subscription status |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` | Yes | Checkout and entitlement |
| `STRIPE_PORTAL_CONFIGURATION_ID` | No | Customer portal configuration |
| `STRIPE_WEBHOOK_SECRET` | In production | Webhook signature verification |

## Deploy to Vercel

1. Import the repository in Vercel (framework preset: Next.js).
2. Add the variables above under **Settings → Environment Variables**, and mark the secret ones Sensitive.
3. Deploy. The narrative route re-runs the deterministic analysis on the server before drafting, and allows up to 120 seconds.
4. In Stripe, add a webhook endpoint for `https://<your-domain>/api/stripe/webhook` with the events `checkout.session.completed` and `customer.subscription.created/updated/deleted`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.

If Vercel Deployment Protection is on, it blocks Stripe's webhook calls. Either turn protection off for Production (the app has its own sign-in and paywall), or create a Protection Bypass for Automation and append `?x-vercel-protection-bypass=<secret>` to the webhook URL.

## How it works

```
Browser
  parse (SheetJS) → raw files (IndexedDB, unchanged)
  mapping → normalize → validate → runAnalysis()   ← pure TypeScript, unit tested
  UI: every figure clickable → formula, inputs, source cells
        │
        │ POST /api/narrative { normalized data, commentary }
        ▼
Server: runAnalysis() again → verified figure catalog → Claude (claude-opus-5, structured output)
        → draft with {{F:id}} tokens → deterministic checks (literal numbers, unknown or unverified figures, causal language)
```

### Project layout

```
src/lib/
  model.ts, fields.ts          Standard finance data model and field definitions
  periods.ts, numbers.ts       Period and amount parsing (conversions are always reported)
  import/                      File parsing, header, period and currency detection, auto-mapping
  normalize.ts, validate.ts    Raw data → standard records; data-quality checks
  calc/                        Variance, forecast, cash, runway, MRR, figure registry (with tests)
  analysis.ts                  runAnalysis(): the whole deterministic pipeline
  narrative/tokens.ts          Figure tokens and the narrative guard
  export/                      Markdown report and CSV tables
  server/                      Anthropic client and narrative prompt (server-only)
  client/                      IndexedDB storage and the sample loader
src/components/                Workspace, steps, figure trace drawer, charts
scripts/generate-samples.mjs   Fictional sample files
```

Chart colors were checked with a color-vision validator against the app's cream background. Scenario lines use blue, orange and aqua, which pass the colorblind-separation checks. The aqua line sits below 3:1 contrast, so every chart has direct labels and a data table. MRR increases and decreases use blue and red.

## Limitations of this version

- Projects are stored in the browser (IndexedDB). They do not sync between devices or follow the account, and clearing site data removes them.
- There is no per-user limit on AI drafting.
- Monthly data only. Quarterly and annual periods are rejected with an explanation.
- No FX conversion. Data in another currency is flagged as unverified.
- The forecast is a simple driver model: revenue growth, gross margin, opex growth, and other cash flow per month.
