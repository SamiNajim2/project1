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

## Run locally

```bash
git clone git@github.com:SamiNajim2/project1.git
cd project1
npm install
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 and click **Open the sample project**. The sample loads four fictional files for "Brightwave Analytics" through the normal import path. Walk through the steps in the left sidebar. In step 8, click **Draft with AI**; each draft takes about 30 seconds. In step 9, sign off and export.

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

## Deploy to Vercel

1. Import the repository in Vercel (framework preset: Next.js).
2. Add `ANTHROPIC_API_KEY` under **Settings → Environment Variables**, marked Sensitive.
3. Deploy. The narrative route (`/api/narrative`) re-runs the deterministic analysis on the server before drafting, and allows up to 120 seconds.

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

- Projects are stored in the browser (IndexedDB). They do not sync between devices, and clearing site data removes them.
- Monthly data only. Quarterly and annual periods are rejected with an explanation.
- No FX conversion. Data in another currency is flagged as unverified.
- The forecast is a simple driver model: revenue growth, gross margin, opex growth, and other cash flow per month.
