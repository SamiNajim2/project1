import { describe, expect, it, vi } from "vitest";
import { RecallClient, fetchWithRetry } from "../src/server/recall/client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createBot payload", () => {
  it("matches the documented v1.11 shape", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return jsonResponse({ id: "bot_123" });
    }) as unknown as typeof fetch;

    const client = new RecallClient("key", "ap-northeast-1", fakeFetch);
    await client.createBot({
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/x",
      botName: "Zeno",
      joinAt: "2026-09-22T10:00:00.000Z",
      realtimeWebhookUrl: "https://zeno.example.com/api/webhooks/recall/realtime",
      realtimeEvents: ["transcript.data", "participant_events.chat_message"],
      joinChatMessage: "Zeno is here.",
      includeBotAudioInRecording: true,
      outputMedia: { camera: { kind: "webpage", config: { url: "https://zeno.example.com/media/tok" } } },
      variant: { microsoft_teams: "web_4_core" },
      metadata: { zeno_meeting_id: "m1" },
    });

    expect(calls[0]?.url).toBe("https://ap-northeast-1.recall.ai/api/v1/bot/");
    const body = calls[0]!.body as Record<string, any>;
    expect(body.bot_name).toBe("Zeno");
    expect(body.join_at).toBe("2026-09-22T10:00:00.000Z");
    expect(body.recording_config.transcript.provider).toEqual({
      recallai_streaming: { language_code: "en", mode: "prioritize_low_latency" },
    });
    expect(body.recording_config.transcript.diarization).toEqual({ use_separate_streams_when_available: true });
    expect(body.recording_config.realtime_endpoints).toEqual([
      {
        type: "webhook",
        url: "https://zeno.example.com/api/webhooks/recall/realtime",
        events: ["transcript.data", "participant_events.chat_message"],
      },
    ]);
    expect(body.recording_config.include_bot_in_recording).toEqual({ audio: true });
    expect(body.output_media).toEqual({
      camera: { kind: "webpage", config: { url: "https://zeno.example.com/media/tok" } },
    });
    expect(body.chat.on_bot_join).toEqual({ send_to: "everyone", message: "Zeno is here.", pin: false });
  });

  it("omits output media when neither voice nor video is on", async () => {
    let captured: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body ?? "{}"));
      return jsonResponse({ id: "bot_456" });
    }) as unknown as typeof fetch;

    await new RecallClient("key", "us-west-2", fakeFetch).createBot({
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/x",
      botName: "Zeno",
      joinAt: "2026-09-22T10:00:00.000Z",
      realtimeWebhookUrl: "https://zeno.example.com/hook",
      realtimeEvents: ["transcript.data"],
    });
    expect(captured.output_media).toBeUndefined();
    expect(captured.variant).toBeUndefined();
  });

  it("sends chat messages and starts and stops output media on the documented endpoints", async () => {
    const seen: { method: string; url: string; body: unknown }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      seen.push({ method: String(init?.method), url: String(url), body: JSON.parse(String(init?.body ?? "null")) });
      return jsonResponse({ id: "bot_1" });
    }) as unknown as typeof fetch;
    const client = new RecallClient("key", "eu-central-1", fakeFetch);

    await client.sendChatMessage("bot_1", "ATL-102 is blocked.");
    await client.startOutputMedia("bot_1", { camera: { kind: "webpage", config: { url: "https://x/media/t" } } });
    await client.stopOutputMedia("bot_1");

    expect(seen.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST https://eu-central-1.recall.ai/api/v1/bot/bot_1/send_chat_message/",
      "POST https://eu-central-1.recall.ai/api/v1/bot/bot_1/output_media/",
      "DELETE https://eu-central-1.recall.ai/api/v1/bot/bot_1/output_media/",
    ]);
    expect(seen[0]?.body).toEqual({ to: "everyone", message: "ATL-102 is blocked." });
    expect(seen[2]?.body).toEqual({ camera: true });
  });

  it("surfaces an API error with its status and body", async () => {
    const fakeFetch = (async () => new Response("bad meeting url", { status: 400 })) as unknown as typeof fetch;
    await expect(
      new RecallClient("key", "us-east-1", fakeFetch).getBot("bot_1"),
    ).rejects.toMatchObject({ status: 400, body: "bad meeting url" });
  });
});

describe("fetchWithRetry", () => {
  it("waits for Retry-After on 429 and then succeeds", async () => {
    const waits: number[] = [];
    let attempt = 0;
    const fakeFetch = (async () => {
      attempt += 1;
      return attempt === 1
        ? new Response("", { status: 429, headers: { "Retry-After": "3" } })
        : jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const response = await fetchWithRetry({
      url: "https://x",
      options: {},
      fetchImpl: fakeFetch,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(response.status).toBe(200);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(3000);
  });

  it("retries 503 and 507 as documented", async () => {
    const statuses = [503, 507, 200];
    let index = 0;
    const waits: number[] = [];
    const fakeFetch = (async () => {
      const status = statuses[index++]!;
      return status === 200 ? jsonResponse({ ok: true }) : new Response("", { status });
    }) as unknown as typeof fetch;

    const response = await fetchWithRetry({
      url: "https://x",
      options: {},
      fetchImpl: fakeFetch,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(response.status).toBe(200);
    expect(waits[0]).toBeGreaterThanOrEqual(10_000);
    expect(waits[1]).toBeGreaterThanOrEqual(30_000);
  });

  it("gives up after the attempt limit", async () => {
    const fakeFetch = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(
      fetchWithRetry({ url: "https://x", options: {}, maxAttempts: 2, fetchImpl: fakeFetch, sleep: async () => {} }),
    ).rejects.toThrow(/Max attempts/);
  });
});
