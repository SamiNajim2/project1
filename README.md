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

## How it stays honest

- **Sources come only from the API's citation metadata.** The research step keeps a finding only when Claude's response attaches a citation: a web search result, a fetched page, your PDF (with page numbers) or your notes. URLs the model writes in plain text are never treated as sources.
- **Every claim is checked by the server.** Analysis steps may cite only evidence IDs from the research step. Unknown IDs are removed. A "fact" with no valid evidence is shown as **Unverified — more evidence needed**. A figure (%, $, million…) in an uncited judgment is flagged the same way.
- **Estimates and assumptions are labeled.** Business-case numbers trace to an assumption table, and each assumption is marked Sourced, Estimate or Assumption.
- **Gaps are explicit.** When the research could not answer something, the report says **More evidence needed**.

## Requirements

- Node.js 20.9 or later (22 or 24 recommended)
- An Anthropic API key with access to `claude-opus-5` and the web search and web fetch tools. Web search must be enabled for your organization in the [Claude Console](https://console.anthropic.com/settings/privacy).

## Run locally

```bash
git clone git@github.com:SamiNajim2/project1.git
cd project1
npm install
cp .env.example .env.local
```

Open `.env.local` and set your key:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Then start the app:

```bash
npm run dev
```

Open http://localhost:3000. The sample project appears on the home page. Click **Start a strategy project** to run your own. A full analysis takes about 5–8 minutes.

### Other commands

```bash
npm run build            # production build
npm start                # serve the production build on port 3000
npm run lint             # ESLint
npm run typecheck        # TypeScript
npm run sample:generate  # re-run the pipeline for the sample brief (needs `npm run dev` running)
```

`npm run sample:generate` rewrites `src/data/sample-project.json` from a live run. It makes real API calls with web search.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Read only on the server, in `src/lib/server/anthropic.ts`. Never sent to the browser. |
| `ANTHROPIC_MODEL` | No | Overrides the model. Defaults to `claude-opus-5`. |

The Supabase variables in `.env.example` are not used by this version, because projects are saved in the browser.

## Deploy to Vercel

1. Import the repository in Vercel (framework preset: Next.js).
2. Add `ANTHROPIC_API_KEY` under **Settings → Environment Variables** for Production and Preview. Mark it Sensitive.
3. Deploy.

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
    page.tsx                      Home: projects and sample
    projects/new/page.tsx         Brief form (PDF upload, URLs, notes)
    projects/[id]/page.tsx        Project workspace
    api/stages/[stage]/route.ts   Pipeline API (validation + streaming)
  components/                     UI: report sections, pipeline, editor
  lib/
    schemas.ts                    Zod schemas for every step's output
    types.ts                      Project and stage types
    markdown.ts                   Markdown export
    report.ts                     Citation index and helpers
    client/                       Browser storage and pipeline runner
    server/                       Anthropic client, prompts, evidence builder, citation checks
  data/sample-project.json        Sample project generated by a real run
scripts/generate-sample.mjs       Regenerates the sample project
```

## Limitations of this version

- Projects are stored in the browser where they were created: localStorage for reports, IndexedDB for PDFs. Clearing site data removes them.
- There are no user accounts, and the deployed API has no rate limiting. Anyone with the URL can run analyses on your API key, so keep the deployment protected or add authentication before sharing it widely.
- PDFs are limited to 10 MB each and 20 MB in total.
