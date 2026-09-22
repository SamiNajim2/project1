# Zeno Meeting Intelligence

Zeno is a meeting agent that joins a Microsoft Teams call, follows the conversation, answers
questions about a Jira workspace, and writes the follow-up when the call ends.

It joins as a participant named **Zeno** through [Recall.ai](https://docs.recall.ai), reasons with
the Anthropic API, speaks with ElevenLabs, and shows itself in the call through Recall Output Media.
Three switches turn its behaviour on and off independently:

| Mode      | What it does                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------- |
| **TEXT**  | Watches the meeting chat for `/zeno …` or `zeno: …` and replies in the chat.                                |
| **VOICE** | Listens for the wake word “Zeno” at the **start** of a finished sentence, answers out loud (under 25s) and posts a short written version in the chat. |
| **VIDEO** | Streams the branded Zeno card as the bot's camera: it animates while listening, thinking and answering.     |

Any combination is valid. With voice or video on, the bot streams a webpage into the call; with both
off, Output Media is stopped and the bot has no camera feed at all.

**Zeno never writes to Jira on its own.** A write is proposed with the exact before/after change, and
someone in the meeting has to reply `confirm` (or `cancel`) within five minutes. Every proposal,
confirmation, cancellation, expiry, application and failure is written to an audit log.

## What is in the box

```
src/server         Node + TypeScript service
  config/env.ts    startup validation — refuses to boot with a missing or wrong variable
  recall/          Recall.ai client (v1.11), webhook signature verification, payload types
  agent/           command parsing, the Claude tool loop, the approval gate, the follow-up writer
  jira/            JiraProvider interface + MockJiraProvider over the seed workspace
  voice/           ElevenLabs speech (only used while VOICE is on)
  media/           the webpage the bot streams into the meeting
  routes/          dashboard API, webhooks, media stream, demo mode
src/web            React dashboard (Control Room, Live Meeting, Mock Jira, Meeting Report)
data/              fake_jira_seed.json — Northstar Software / Atlas Launch, ATL-101…ATL-108
tests/             67 unit and integration tests, no network calls
```

## Requirements

Node 22+, and a Postgres database. A Recall.ai workspace, an Anthropic API key and an ElevenLabs
key. Everything is read from the environment — see `.env.example` for the names.

| Variable | What it is |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic API key (reasoning and tool use) |
| `RECALL_REGION` | `us-west-2`, `us-east-1`, `eu-central-1` or `ap-northeast-1` — must match the region your key was made in |
| `RECALL_API_KEY` | Recall.ai API key from that same region |
| `WEBHOOK_SECRET` | Recall **workspace verification secret** (`whsec_…`), used to verify every request Recall sends |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | Speech for voice mode |
| `APP_BASE_URL` | The public HTTPS URL Recall can reach (Railway domain, or a static ngrok URL locally) |
| `DATABASE_URL` | Postgres connection string, or `memory:` for a throwaway in-process store |
| `PORT` | Defaults to 8080 |

Optional: `ZENO_LIVE_MODEL` (default `claude-sonnet-5`), `ZENO_REPORT_MODEL` (default
`claude-opus-5`), `LOG_LEVEL`, `LOG_TRANSCRIPT` (default `false` — transcript text is kept out of the
logs unless you turn it on).

## Local demo (no Teams call needed)

```bash
npm install
cp .env.example .env.local     # fill in the values
npm run build
DATABASE_URL="memory:" APP_BASE_URL="https://your-app.example.com" npm start
```

Open http://localhost:8080 and:

1. **Control Room** → *Run a demo meeting*. A scripted Sprint 12 standup replays into the transcript.
2. **Live Meeting** → ask `Which issues are blocking the launch and who owns them?` in *Ask Zeno from here*.
3. Ask `Move ATL-103 to Done`. Zeno proposes the change; the board does not move.
4. Press **Confirm**. The board updates and the audit log shows before → after.
5. **Mock Jira** → see ATL-103 in Done and the change history. *Reset board to seed* puts it back.
6. **Live Meeting** → *End demo + write follow-up*, then **Meeting Report** → decisions, action items,
   unresolved questions, proposed Jira changes, and a Markdown export.

Demo mode runs the same code path as a real meeting — only the Recall transport is simulated.

## Live demo in a real Teams meeting

1. Start the meeting in Teams and copy its join link. It must be a **normal meeting, not a channel
   meeting**, and the meeting chat has to be open to anonymous participants — otherwise Teams will not
   let a bot read or post chat messages.
2. In the Control Room, paste the link, choose the modes, and press **Send Zeno**.
3. Admit Zeno from the lobby when Teams asks. The dashboard follows it: scheduled → joining → lobby →
   in meeting → ended.
4. **Text:** type `/zeno show launch blockers` in the meeting chat.
5. **Voice:** say “Zeno, what's blocking the launch?” — the wake word only counts at the start of a
   sentence, so mentioning Zeno mid-sentence will not set it off.
6. **Writes:** say or type `/zeno move ATL-103 to Done`. Zeno states the exact change and waits.
   Reply `confirm` to apply it, `cancel` to drop it, or say nothing and it expires in five minutes.
7. **Video:** toggle VIDEO in the dashboard and watch the bot's camera change between the still brand
   card and the animated one.
8. End the call. The follow-up appears under Meeting Report and can be exported as Markdown.

Things Zeno will not do: answer from outside the transcript or the board (it says it cannot verify
it), claim a Jira change happened before the provider confirmed it, or show a fabricated human face.

## Recall.ai setup (one time, per region)

1. Create an API key and a **workspace verification secret** in the dashboard for your region.
2. Add a webhook endpoint in the same region pointing at `<APP_BASE_URL>/api/webhooks/recall/status`,
   subscribed to `bot.*` (plus `recording.*` and `transcript.*` if you want them). Bot status changes
   only arrive through this dashboard endpoint.
3. Transcript and chat events are **not** configured in the dashboard: they are attached per bot in
   the Create Bot request and delivered to `<APP_BASE_URL>/api/webhooks/recall/realtime`.
4. Locally, put a static ngrok URL in `APP_BASE_URL`. Recall rejects `localhost` and bare IPs.

## Deploying to Railway

The repository ships a `Dockerfile` and `railway.json` with a `/healthz` health check.

```bash
railway up            # or connect the GitHub repo to a Railway service
```

Add a Postgres database to the project and set `DATABASE_URL` to its connection string, then set the
variables listed above on the service. Generate a domain and put it in `APP_BASE_URL`, then redeploy
so the bot hands Recall the right callback URLs.

## Development

```bash
npm run dev        # server on :8080 with the dashboard on :5173
npm run lint
npm run typecheck
npm test
```

## Notes on safety and privacy

- Every request from Recall is verified against the workspace secret before it is read; unverified
  requests are rejected and never stored or processed.
- Webhooks are acknowledged immediately and processed in the background, so Recall never retries a
  slow handler.
- The Output Media page URL carries a signed, expiring token — it is not a public page.
- Secrets are read from the environment only. They are never logged, never stored and never sent to
  the browser. Transcript text stays out of the logs unless `LOG_TRANSCRIPT=true`.
- Swapping the mock Jira for the real one means writing a `JiraCloudProvider` that implements
  `JiraProvider` (`src/server/jira/provider.ts`). Nothing else in the app changes: the approval gate,
  the audit log and the agent keep working exactly as they do now.
