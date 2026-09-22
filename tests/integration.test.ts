import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import type { AppContext } from "../src/server/context.js";
import { MemoryStore } from "../src/server/db/memory.js";
import { loadJiraSeed } from "../src/server/db/seedData.js";
import { MockJiraProvider } from "../src/server/jira/mock.js";
import { EventBus } from "../src/server/lib/eventBus.js";
import { MediaHub } from "../src/server/lib/mediaHub.js";
import { RecallClient } from "../src/server/recall/client.js";
import { MeetingOrchestrator } from "../src/server/agent/runtime.js";
import { SilentSynthesizer } from "../src/server/voice/elevenlabs.js";
import { runTool } from "../src/server/agent/tools.js";
import type { AnswerRequest, AnswerResult, ZenoAgent } from "../src/server/agent/claude.js";
import { readEnv } from "../src/server/config/env.js";

const SECRET = "whsec_" + Buffer.from("integration-secret-0000000000000").toString("base64");

const env = readEnv({
  ANTHROPIC_API_KEY: "sk-ant-test",
  RECALL_API_KEY: "recall-test",
  RECALL_REGION: "ap-northeast-1",
  ELEVENLABS_API_KEY: "eleven-test",
  ELEVENLABS_VOICE_ID: "voice-test",
  APP_BASE_URL: "https://zeno.example.com",
  WEBHOOK_SECRET: SECRET,
  DATABASE_URL: "memory:",
});

interface RecallCall {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

/** Stands in for Claude: drives the real tool layer, so proposals and reads are genuine. */
function stubAgent(): ZenoAgent {
  return {
    reportModelName: "stub-report-model",
    anthropic: {
      beta: {
        messages: {
          parse: async () => ({
            stop_reason: "end_turn",
            parsed_output: {
              headline: "Sprint 12 standup: launch blockers reviewed.",
              decisions: [{ decision: "Load test runs Thursday morning.", evidence: "Thursday morning is the load test window" }],
              action_items: [
                { description: "Escalate the Okta ticket", owner: "Dana Whitfield", deadline: null, evidence: "escalate the Okta ticket" },
              ],
              unresolved_questions: ["Do we announce on the thirtieth?"],
              proposed_jira_changes: [
                {
                  tool: "addComment",
                  issue_key: "ATL-102",
                  change: "Record the Okta escalation on ATL-102.",
                  status: null,
                  assignee: null,
                  comment: "Escalated to Okta support manager.",
                  summary: null,
                  evidence: "escalate the Okta ticket",
                },
              ],
            },
          }),
        },
      },
    },
    async answer(request: AnswerRequest): Promise<AnswerResult> {
      if (/move ATL-103 to done/i.test(request.question)) {
        const outcome = await runTool(
          "transitionIssue",
          { key: "ATL-103", status: "Done" },
          request.toolContext,
        );
        return {
          answer: `Proposal: move ATL-103 to Done. Reply confirm or cancel.`,
          spokenAnswer: "Proposal: move ATL-103 to Done. Reply confirm or cancel.",
          issueKeys: outcome.issueKeys,
          approval: outcome.approval ?? null,
          toolCalls: [{ name: "transitionIssue", input: {} }],
        };
      }
      const outcome = await runTool("searchIssues", { label: "launch-blocker" }, request.toolContext);
      return {
        answer: `Launch blockers: ${outcome.issueKeys.join(", ")}.`,
        spokenAnswer: `Launch blockers: ${outcome.issueKeys.join(", ")}.`,
        issueKeys: outcome.issueKeys,
        approval: null,
        toolCalls: [{ name: "searchIssues", input: {} }],
      };
    },
  } as unknown as ZenoAgent;
}

let server: Server;
let base: string;
let ctx: AppContext;
let recallCalls: RecallCall[];

beforeEach(async () => {
  recallCalls = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const path = String(url).replace("https://ap-northeast-1.recall.ai/api/v1", "");
    recallCalls.push({
      method: String(init?.method ?? "GET"),
      path,
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return new Response(JSON.stringify({ id: "bot_integration" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

  const store = new MemoryStore(loadJiraSeed());
  await store.init();
  const provider = new MockJiraProvider(store);
  const bus = new EventBus();
  const media = new MediaHub();
  const recall = new RecallClient(env.RECALL_API_KEY, env.RECALL_REGION, fakeFetch);
  const agent = stubAgent();
  const synthesizer = new SilentSynthesizer();

  ctx = {
    env,
    store,
    provider,
    agent,
    recall,
    synthesizer,
    bus,
    media,
    orchestrator: new MeetingOrchestrator({ store, provider, agent, recall, synthesizer, bus, media, env }),
    startedAt: Date.now(),
  };

  server = createApp(ctx).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function signedHeaders(payload: string, secret = SECRET): Record<string, string> {
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", new Uint8Array(key))
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
}

async function post(path: string, body: unknown, options?: { secret?: string; unsigned?: boolean }) {
  const payload = JSON.stringify(body);
  const headers = options?.unsigned
    ? { "content-type": "application/json" }
    : signedHeaders(payload, options?.secret);
  return fetch(`${base}${path}`, { method: "POST", headers, body: payload });
}

async function createMeeting(modes: Record<string, boolean>) {
  const response = await fetch(`${base}/api/meetings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingUrl: "https://teams.microsoft.com/l/meetup-join/19%3ademo", modes }),
  });
  const { meeting } = (await response.json()) as { meeting: { id: string; botId: string } };
  return meeting;
}

const detail = async (id: string) =>
  (await fetch(`${base}/api/meetings/${id}`).then((r) => r.json())) as Record<string, any>;

function transcriptEvent(text: string, speaker = "Priya Raman") {
  return {
    event: "transcript.data",
    data: {
      data: {
        words: text.split(" ").map((word, index) => ({
          text: word,
          start_timestamp: { relative: index },
          end_timestamp: { relative: index + 1 },
        })),
        language_code: "en",
        participant: { id: 1, name: speaker, is_host: true, platform: "teams", extra_data: null, email: null },
      },
      transcript: { id: "t1", metadata: {} },
      recording: { id: "r1", metadata: {} },
      bot: { id: "bot_integration", metadata: {} },
    },
  };
}

function chatEvent(text: string, sender = "Sofia Alvarez") {
  return {
    event: "participant_events.chat_message",
    data: {
      data: {
        participant: { id: 2, name: sender, is_host: false, platform: "teams", extra_data: null, email: null },
        timestamp: { absolute: new Date().toISOString(), relative: 12 },
        data: { text, to: "everyone" },
      },
      participant_events: { id: "p1", metadata: {} },
      recording: { id: "r1", metadata: {} },
      bot: { id: "bot_integration", metadata: {} },
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

describe("health and config", () => {
  it("reports healthy and never leaks secrets", async () => {
    const health = await fetch(`${base}/healthz`).then((r) => r.json());
    expect(health.status).toBe("ok");
    expect(health.recallRegion).toBe("ap-northeast-1");

    const config = await fetch(`${base}/api/config`).then((r) => r.text());
    expect(config).not.toContain(SECRET);
    expect(config).not.toContain("sk-ant-test");
    expect(config).not.toContain("recall-test");
  });
});

describe("sending Zeno to a meeting", () => {
  it("creates a bot with text-only settings and no Output Media", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });
    expect(meeting.botId).toBe("bot_integration");

    const create = recallCalls.find((call) => call.path === "/bot/");
    expect(create?.body.bot_name).toBe("Zeno");
    expect(create?.body.output_media).toBeUndefined();
    const config = create?.body.recording_config as Record<string, any>;
    expect(config.realtime_endpoints[0].events).toContain("transcript.data");
    expect(config.realtime_endpoints[0].events).toContain("participant_events.chat_message");
    expect(config.realtime_endpoints[0].url).toBe("https://zeno.example.com/api/webhooks/recall/realtime");
  });

  it("streams the Zeno webpage when voice or video is on, and stops it when both go off", async () => {
    const meeting = await createMeeting({ text: true, voice: true, video: true });
    const create = recallCalls.find((call) => call.path === "/bot/");
    const outputMedia = create?.body.output_media as Record<string, any>;
    expect(outputMedia.camera.kind).toBe("webpage");
    expect(outputMedia.camera.config.url).toMatch(/^https:\/\/zeno\.example\.com\/media\//);

    await post("/api/webhooks/recall/status", {
      event: "bot.in_call_recording",
      data: { data: { code: "in_call_recording", sub_code: null, updated_at: new Date().toISOString() }, bot: { id: "bot_integration", metadata: {} } },
    });
    await settle();

    await fetch(`${base}/api/meetings/${meeting.id}/modes`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ voice: false, video: false }),
    });
    expect(recallCalls.some((call) => call.method === "DELETE" && call.path.endsWith("/output_media/"))).toBe(true);

    const after = await detail(meeting.id);
    expect(after.meeting.outputMediaActive).toBe(false);
  });
});

describe("webhook verification", () => {
  it("rejects an unsigned request and stores nothing", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });
    const response = await post("/api/webhooks/recall/realtime", transcriptEvent("hello there"), { unsigned: true });
    expect(response.status).toBe(401);
    await settle();
    expect((await detail(meeting.id)).utterances).toHaveLength(0);
  });

  it("rejects a request signed with the wrong secret", async () => {
    await createMeeting({ text: true, voice: false, video: false });
    const other = "whsec_" + Buffer.from("wrong-secret-value-00000000000000").toString("base64");
    const response = await post("/api/webhooks/recall/realtime", transcriptEvent("hello"), { secret: other });
    expect(response.status).toBe(401);
  });
});

describe("lifecycle and transcript", () => {
  it("tracks bot status changes through to ended", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });
    const statuses = [
      ["bot.joining_call", "joining"],
      ["bot.in_waiting_room", "lobby"],
      ["bot.in_call_recording", "active"],
    ] as const;

    for (const [event, expected] of statuses) {
      await post("/api/webhooks/recall/status", {
        event,
        data: { data: { code: event.replace("bot.", ""), sub_code: null, updated_at: new Date().toISOString() }, bot: { id: "bot_integration", metadata: {} } },
      });
      await settle();
      expect((await detail(meeting.id)).meeting.status).toBe(expected);
    }

    await post("/api/webhooks/recall/status", {
      event: "bot.fatal",
      data: { data: { code: "fatal", sub_code: "meeting_not_found", updated_at: new Date().toISOString() }, bot: { id: "bot_integration", metadata: {} } },
    });
    await settle();
    const failed = (await detail(meeting.id)).meeting;
    expect(failed.status).toBe("failed");
    expect(failed.statusDetail).toContain("meeting_not_found");
  });

  it("stores utterances with their speaker", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });
    await post("/api/webhooks/recall/realtime", transcriptEvent("Billing is still the top blocker", "Marcus Lee"));
    await settle();
    const [utterance] = (await detail(meeting.id)).utterances;
    expect(utterance.speaker).toBe("Marcus Lee");
    expect(utterance.text).toBe("Billing is still the top blocker");
    expect(utterance.isFinal).toBe(true);
  });
});

describe("text mode", () => {
  it("answers a /zeno command in the meeting chat", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });
    await post("/api/webhooks/recall/realtime", chatEvent("/zeno show launch blockers"));
    await settle();

    const data = await detail(meeting.id);
    expect(data.commands[0].channel).toBe("text");
    expect(data.commands[0].status).toBe("answered");
    expect(data.commands[0].issueKeys).toEqual(["ATL-101", "ATL-102", "ATL-105"]);

    const reply = recallCalls.find((call) => call.path.endsWith("/send_chat_message/"));
    expect(reply?.body.to).toBe("everyone");
    expect(String(reply?.body.message)).toContain("ATL-101");
  });

  it("ignores chat commands while text mode is off", async () => {
    const meeting = await createMeeting({ text: false, voice: false, video: false });
    await post("/api/webhooks/recall/realtime", chatEvent("/zeno show launch blockers"));
    await settle();
    const data = await detail(meeting.id);
    expect(data.commands).toHaveLength(0);
    expect(data.chat).toHaveLength(1);
    expect(recallCalls.some((call) => call.path.endsWith("/send_chat_message/"))).toBe(false);
  });
});

describe("voice mode", () => {
  it("answers only when the wake phrase starts a finalized utterance", async () => {
    const meeting = await createMeeting({ text: true, voice: true, video: false });

    await post("/api/webhooks/recall/realtime", transcriptEvent("we should ask Zeno about the blockers later"));
    await settle();
    expect((await detail(meeting.id)).commands).toHaveLength(0);

    await post("/api/webhooks/recall/realtime", transcriptEvent("Zeno what is blocking the launch"));
    await settle();
    const data = await detail(meeting.id);
    expect(data.commands).toHaveLength(1);
    expect(data.commands[0].channel).toBe("voice");
    // A spoken answer is also posted to the chat so the room has it in writing.
    expect(recallCalls.some((call) => call.path.endsWith("/send_chat_message/"))).toBe(true);
  });

  it("does not answer the same utterance twice", async () => {
    const meeting = await createMeeting({ text: true, voice: true, video: false });
    const event = transcriptEvent("Zeno what is blocking the launch");
    await post("/api/webhooks/recall/realtime", event);
    await settle();
    await post("/api/webhooks/recall/realtime", event);
    await settle();
    expect((await detail(meeting.id)).commands).toHaveLength(1);
  });

  it("stays silent while voice mode is off", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });
    await post("/api/webhooks/recall/realtime", transcriptEvent("Zeno what is blocking the launch"));
    await settle();
    expect((await detail(meeting.id)).commands).toHaveLength(0);
  });
});

describe("write confirmation", () => {
  it("proposes, waits for confirm, then applies and audits the change", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });

    await post("/api/webhooks/recall/realtime", chatEvent("/zeno move ATL-103 to Done"));
    await settle();

    let data = await detail(meeting.id);
    expect(data.commands[0].status).toBe("awaiting_confirmation");
    expect(data.approvals[0].status).toBe("pending");
    expect(data.approvals[0].preview).toContain("from In Review to Done");

    const board = await fetch(`${base}/api/jira`).then((r) => r.json());
    expect(board.workspace.issues.find((issue: any) => issue.key === "ATL-103").status).toBe("In Review");

    await post("/api/webhooks/recall/realtime", chatEvent("confirm", "Priya Raman"));
    await settle();

    data = await detail(meeting.id);
    expect(data.approvals[0].status).toBe("applied");
    expect(data.audit.map((event: any) => event.action)).toEqual([
      "proposed:transitionIssue",
      "applied:transitionIssue",
    ]);
    expect(data.audit[1].before).toEqual({ status: "In Review" });
    expect(data.audit[1].after).toEqual({ status: "Done" });

    const afterBoard = await fetch(`${base}/api/jira`).then((r) => r.json());
    expect(afterBoard.workspace.issues.find((issue: any) => issue.key === "ATL-103").status).toBe("Done");
  });

  it("cancel leaves the board untouched", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });
    await post("/api/webhooks/recall/realtime", chatEvent("/zeno move ATL-103 to Done"));
    await settle();
    await post("/api/webhooks/recall/realtime", chatEvent("cancel", "Priya Raman"));
    await settle();

    const data = await detail(meeting.id);
    expect(data.approvals[0].status).toBe("cancelled");
    const board = await fetch(`${base}/api/jira`).then((r) => r.json());
    expect(board.workspace.issues.find((issue: any) => issue.key === "ATL-103").status).toBe("In Review");
  });
});

describe("output media page", () => {
  it("serves the branded page for a valid token and refuses an invalid one", async () => {
    const meeting = await createMeeting({ text: true, voice: true, video: true });
    const create = recallCalls.find((call) => call.path === "/bot/");
    const url = new URL((create?.body.output_media as any).camera.config.url);

    const page = await fetch(`${base}${url.pathname}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Zeno");
    expect(html).not.toContain(SECRET);

    expect((await fetch(`${base}/media/not-a-real-token`)).status).toBe(403);
    expect((await fetch(`${base}/api/media/not-a-real-token/stream`)).status).toBe(403);
    expect(meeting.id).toBeTruthy();
  });
});

describe("meeting follow-up", () => {
  it("writes the report when the call ends and exports it as Markdown", async () => {
    const meeting = await createMeeting({ text: true, voice: false, video: false });
    await post("/api/webhooks/recall/realtime", transcriptEvent("Thursday morning is the load test window"));
    await settle();
    await post("/api/webhooks/recall/status", {
      event: "bot.done",
      data: { data: { code: "done", sub_code: null, updated_at: new Date().toISOString() }, bot: { id: "bot_integration", metadata: {} } },
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const data = await detail(meeting.id);
    expect(data.meeting.status).toBe("ended");
    expect(data.report.decisions).toHaveLength(1);
    expect(data.report.actionItems[0].owner).toBe("Dana Whitfield");
    expect(data.report.proposedJiraChanges[0].issueKey).toBe("ATL-102");

    const markdown = await fetch(`${base}/api/meetings/${meeting.id}/report.md`).then((r) => r.text());
    expect(markdown).toContain("## Decisions");
    expect(markdown).toContain("## Action items");
    expect(markdown).toContain("## Unresolved questions");
    expect(markdown).toContain("_Proposals only. Each one still needs a human confirmation before it is applied._");
  });
});
