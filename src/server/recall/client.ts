import { log } from "../lib/logger.js";
import { recallApiBase, type RecallRegion } from "../config/env.js";
import type { CreateBotResponse } from "./types.js";

export class RecallApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

export interface OutputMediaConfig {
  camera?: { kind: "webpage"; config: { url: string } };
  screenshare?: { kind: "webpage"; config: { url: string } };
}

export interface CreateBotParams {
  meetingUrl: string;
  botName: string;
  joinAt: string;
  realtimeWebhookUrl: string;
  realtimeEvents: string[];
  joinChatMessage?: string;
  outputMedia?: OutputMediaConfig;
  includeBotAudioInRecording?: boolean;
  variant?: Record<string, string>;
  metadata?: Record<string, string>;
}

/** Thin client over the Recall.ai v1.11 API. Every call goes through fetchWithRetry. */
export class RecallClient {
  private readonly base: string;

  constructor(
    private readonly apiKey: string,
    region: RecallRegion,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = recallApiBase(region);
  }

  /**
   * POST /api/v1/bot/ — always treated as a scheduling operation: `join_at` is
   * passed even when the bot should join immediately.
   */
  async createBot(params: CreateBotParams): Promise<CreateBotResponse> {
    const body: Record<string, unknown> = {
      meeting_url: params.meetingUrl,
      bot_name: params.botName,
      join_at: params.joinAt,
      recording_config: {
        transcript: {
          provider: {
            recallai_streaming: { language_code: "en", mode: "prioritize_low_latency" },
          },
          diarization: { use_separate_streams_when_available: true },
        },
        realtime_endpoints: [
          {
            type: "webhook",
            url: params.realtimeWebhookUrl,
            events: params.realtimeEvents,
          },
        ],
        ...(params.includeBotAudioInRecording
          ? { include_bot_in_recording: { audio: true } }
          : {}),
      },
    };
    if (params.joinChatMessage) {
      body.chat = {
        on_bot_join: { send_to: "everyone", message: params.joinChatMessage, pin: false },
      };
    }
    if (params.outputMedia) body.output_media = params.outputMedia;
    if (params.variant) body.variant = params.variant;
    if (params.metadata) body.metadata = params.metadata;

    return this.request<CreateBotResponse>("POST", "/bot/", body);
  }

  /** POST /api/v1/bot/{id}/send_chat_message/ */
  async sendChatMessage(botId: string, message: string): Promise<void> {
    await this.request("POST", `/bot/${botId}/send_chat_message/`, {
      to: "everyone",
      message,
    });
  }

  /** POST /api/v1/bot/{id}/output_media/ */
  async startOutputMedia(botId: string, config: OutputMediaConfig): Promise<void> {
    await this.request("POST", `/bot/${botId}/output_media/`, config);
  }

  /** DELETE /api/v1/bot/{id}/output_media/ */
  async stopOutputMedia(botId: string): Promise<void> {
    await this.request("DELETE", `/bot/${botId}/output_media/`, { camera: true });
  }

  /** POST /api/v1/bot/{id}/leave_call/ */
  async leaveCall(botId: string): Promise<void> {
    await this.request("POST", `/bot/${botId}/leave_call/`, {});
  }

  /** GET /api/v1/bot/{id}/ */
  async getBot(botId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", `/bot/${botId}/`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchWithRetry({
      url: `${this.base}${path}`,
      fetchImpl: this.fetchImpl,
      options: {
        method,
        headers: {
          Authorization: this.apiKey,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new RecallApiError(
        `Recall API ${method} ${path} failed with ${response.status}`,
        response.status,
        text.slice(0, 500),
      );
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}

/**
 * Retries the status codes Recall documents as retryable: 429 (respecting
 * Retry-After), 503 and 507. Every request to Recall goes through this.
 */
export async function fetchWithRetry(args: {
  url: string;
  options: RequestInit;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Response> {
  const {
    url,
    options,
    maxAttempts = 6,
    fetchImpl = fetch,
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = args;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchImpl(url, options);
    let waitFor: number | null = null;
    switch (response.status) {
      case 429:
        waitFor = Number.parseInt(response.headers.get("Retry-After") ?? "0", 10) || 1;
        break;
      case 503:
        waitFor = 10;
        break;
      case 507:
        waitFor = 30;
        break;
      default:
        waitFor = null;
    }
    if (waitFor === null) return response;
    log.warn("recall retryable status", { status: response.status, attempt, waitFor });
    await sleep(1000 * (waitFor + Math.ceil(Math.random() * 5)));
  }
  throw new RecallApiError(`Max attempts reached while calling ${url}`, 0, "");
}
