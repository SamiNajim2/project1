import { randomUUID } from "node:crypto";
import type {
  AgentVisualState,
  ChatMessage,
  CommandChannel,
  CommandRecord,
  Meeting,
  MeetingStatus,
  ModeState,
  Utterance,
} from "../../shared/types.js";
import type { Env } from "../config/env.js";
import type { Store } from "../db/store.js";
import type { JiraProvider } from "../jira/provider.js";
import type { EventBus } from "../lib/eventBus.js";
import { errorFields, log } from "../lib/logger.js";
import type { MediaHub } from "../lib/mediaHub.js";
import { createMediaToken } from "../lib/tokens.js";
import { RecallApiError, type RecallClient } from "../recall/client.js";
import type { BotStatusChangeEvent, ChatMessageEvent, RealtimeEvent } from "../recall/types.js";
import { applyProposal, cancelProposal, pendingProposal } from "./approvals.js";
import type { ZenoAgent } from "./claude.js";
import {
  Cooldown,
  Deduper,
  estimateSpeechSeconds,
  fitSpokenAnswer,
  parseChatCommand,
  parseVoiceCommand,
  stripHtml,
} from "./commands.js";
import type { SpeechSynthesizer } from "../voice/elevenlabs.js";
import { generateReport } from "./report.js";

const MEDIA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const REALTIME_EVENTS = [
  "transcript.data",
  "participant_events.chat_message",
  "participant_events.join",
  "participant_events.leave",
];

export interface OrchestratorDeps {
  store: Store;
  provider: JiraProvider;
  agent: ZenoAgent;
  recall: RecallClient;
  synthesizer: SpeechSynthesizer;
  bus: EventBus;
  media: MediaHub;
  env: Env;
}

interface RuntimeState {
  deduper: Deduper;
  cooldown: Cooldown;
  answering: boolean;
}

export interface CreateMeetingInput {
  meetingUrl: string;
  title?: string;
  modes?: Partial<ModeState>;
  demo?: boolean;
}

/** Owns everything that happens to one meeting from "Send Zeno" to the follow-up. */
export class MeetingOrchestrator {
  private readonly runtime = new Map<string, RuntimeState>();

  constructor(private readonly deps: OrchestratorDeps) {}

  mediaToken(meeting: Meeting): string {
    return createMediaToken({
      secret: this.deps.env.WEBHOOK_SECRET,
      meetingId: meeting.id,
      ttlMs: MEDIA_TOKEN_TTL_MS,
      now: Date.parse(meeting.createdAt),
    });
  }

  mediaUrl(meeting: Meeting): string {
    return `${this.deps.env.APP_BASE_URL}/media/${this.mediaToken(meeting)}`;
  }

  /** Creates the meeting record and sends the Zeno bot to the Teams call. */
  async createMeeting(input: CreateMeetingInput): Promise<Meeting> {
    const modes: ModeState = {
      text: input.modes?.text ?? true,
      voice: input.modes?.voice ?? false,
      video: input.modes?.video ?? false,
    };
    const now = new Date();
    const meeting: Meeting = {
      id: randomUUID(),
      botId: null,
      meetingUrl: input.meetingUrl,
      title: input.title?.trim() || defaultTitle(input.meetingUrl, now),
      platform: platformOf(input.meetingUrl),
      status: "scheduled",
      statusDetail: input.demo ? "Demo meeting — no bot is sent." : "Creating the Recall bot…",
      modes,
      demo: input.demo ?? false,
      outputMediaActive: false,
      recordingId: null,
      createdAt: now.toISOString(),
      joinedAt: null,
      endedAt: null,
    };
    await this.deps.store.createMeeting(meeting);
    this.publishMeeting(meeting);

    if (meeting.demo) {
      return this.updateMeeting(meeting.id, {
        status: "active",
        statusDetail: "Demo meeting — feed it events from the Control Room.",
        joinedAt: now.toISOString(),
        outputMediaActive: modes.voice || modes.video,
      });
    }

    const needsMedia = modes.voice || modes.video;
    try {
      const bot = await this.deps.recall.createBot({
        meetingUrl: meeting.meetingUrl,
        botName: "Zeno",
        joinAt: now.toISOString(),
        realtimeWebhookUrl: `${this.deps.env.APP_BASE_URL}/api/webhooks/recall/realtime`,
        realtimeEvents: REALTIME_EVENTS,
        joinChatMessage: joinMessage(modes),
        includeBotAudioInRecording: modes.voice,
        ...(needsMedia
          ? {
              outputMedia: { camera: { kind: "webpage" as const, config: { url: this.mediaUrl(meeting) } } },
              variant: { microsoft_teams: "web_4_core", zoom: "web_4_core", google_meet: "web_4_core" },
            }
          : {}),
        metadata: { zeno_meeting_id: meeting.id },
      });
      log.info("bot created", { meetingId: meeting.id, botId: bot.id, modes });
      return this.updateMeeting(meeting.id, {
        botId: bot.id,
        status: "joining",
        statusDetail: "Bot created. Waiting for it to join the call.",
        outputMediaActive: needsMedia,
      });
    } catch (error) {
      const detail =
        error instanceof RecallApiError
          ? `Recall rejected the bot (HTTP ${error.status}). ${error.body}`
          : String(error);
      log.error("bot creation failed", { meetingId: meeting.id, ...errorFields(error) });
      return this.updateMeeting(meeting.id, { status: "failed", statusDetail: detail });
    }
  }

  /** TEXT / VOICE / VIDEO switch independently; Output Media follows voice OR video. */
  async setModes(meetingId: string, patch: Partial<ModeState>): Promise<Meeting> {
    const meeting = await this.requireMeeting(meetingId);
    const modes: ModeState = { ...meeting.modes, ...patch };
    const wasMedia = meeting.modes.voice || meeting.modes.video;
    const needsMedia = modes.voice || modes.video;
    let outputMediaActive = meeting.outputMediaActive;

    if (!meeting.demo && meeting.botId && meeting.status === "active" && wasMedia !== needsMedia) {
      try {
        if (needsMedia) {
          await this.deps.recall.startOutputMedia(meeting.botId, {
            camera: { kind: "webpage", config: { url: this.mediaUrl(meeting) } },
          });
          outputMediaActive = true;
        } else {
          await this.deps.recall.stopOutputMedia(meeting.botId);
          outputMediaActive = false;
        }
      } catch (error) {
        log.error("output media switch failed", { meetingId, ...errorFields(error) });
        throw error;
      }
    } else if (meeting.demo || meeting.status !== "active") {
      outputMediaActive = needsMedia;
    }

    const updated = await this.updateMeeting(meetingId, { modes, outputMediaActive });
    this.deps.media.setModes(meetingId, modes);
    this.setVisual(updated, updated.status === "active" && modes.voice ? "listening" : "idle");
    log.info("modes changed", { meetingId, modes });
    return updated;
  }

  /** Bot lifecycle webhook from the Recall dashboard endpoint. */
  async handleBotStatus(event: BotStatusChangeEvent): Promise<void> {
    const botId = event.data?.bot?.id;
    if (!botId) {
      log.debug("status event without a bot id", { event: event.event });
      return;
    }
    const meeting = await this.deps.store.getMeetingByBotId(botId);
    if (!meeting) {
      log.warn("status event for unknown bot", { botId, event: event.event });
      return;
    }
    const mapped = mapStatus(event.event, event.data.data.sub_code);
    if (!mapped) return;

    const patch: Partial<Meeting> = { status: mapped.status, statusDetail: mapped.detail };
    if (mapped.status === "active" && !meeting.joinedAt) patch.joinedAt = new Date().toISOString();
    if (mapped.status === "ended" || mapped.status === "failed") {
      patch.endedAt = new Date().toISOString();
      patch.outputMediaActive = false;
    }
    const updated = await this.updateMeeting(meeting.id, patch);
    log.info("bot status", { meetingId: meeting.id, event: event.event, status: mapped.status });

    if (mapped.status === "active") {
      this.setVisual(updated, updated.modes.voice ? "listening" : "idle");
    }
    if (mapped.status === "ended") {
      this.setVisual(updated, "idle");
      void this.buildReport(updated.id);
    }
  }

  /** Real-time endpoint events configured on the bot: transcript and chat. */
  async handleRealtimeEvent(event: RealtimeEvent): Promise<void> {
    const botId = event.data.bot?.id;
    if (!botId) return;
    const meeting = await this.deps.store.getMeetingByBotId(botId);
    if (!meeting) {
      log.warn("realtime event for unknown bot", { botId, event: event.event });
      return;
    }

    if (event.event === "transcript.data" || event.event === "transcript.partial_data") {
      const words = event.data.data.words ?? [];
      const text = words.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim();
      if (!text) return;
      await this.ingestUtterance(meeting, {
        speaker: event.data.data.participant?.name ?? "Unknown speaker",
        participantId: String(event.data.data.participant?.id ?? ""),
        text,
        isFinal: event.event === "transcript.data",
        startRelative: words[0]?.start_timestamp?.relative ?? null,
        endRelative: words[words.length - 1]?.end_timestamp?.relative ?? null,
      });
      return;
    }

    if (event.event === "participant_events.chat_message") {
      const chat = event as ChatMessageEvent;
      await this.ingestChatMessage(meeting, {
        sender: chat.data.data.participant?.name ?? "Unknown participant",
        text: chat.data.data.data?.text ?? "",
      });
      return;
    }

    if (event.event === "participant_events.join" || event.event === "participant_events.leave") {
      log.debug("participant event", { meetingId: meeting.id, event: event.event });
    }
  }

  /** Stores an utterance and, in voice mode, checks it for the wake phrase. */
  async ingestUtterance(
    meeting: Meeting,
    input: {
      speaker: string;
      participantId: string | null;
      text: string;
      isFinal: boolean;
      startRelative: number | null;
      endRelative: number | null;
    },
  ): Promise<Utterance> {
    const utterance: Utterance = {
      id: randomUUID(),
      meetingId: meeting.id,
      speaker: input.speaker,
      participantId: input.participantId,
      text: input.text,
      isFinal: input.isFinal,
      startRelative: input.startRelative,
      endRelative: input.endRelative,
      receivedAt: new Date().toISOString(),
    };
    await this.deps.store.addUtterance(utterance);
    this.deps.bus.publish({ type: "utterance", utterance });

    if (input.isFinal && meeting.modes.voice) {
      await this.maybeAnswerSpoken(meeting, utterance);
    }
    return utterance;
  }

  /** Stores a chat message and, in text mode, checks it for a /zeno command. */
  async ingestChatMessage(
    meeting: Meeting,
    input: { sender: string; text: string; fromBot?: boolean },
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: randomUUID(),
      meetingId: meeting.id,
      sender: input.sender,
      text: stripHtml(input.text),
      fromBot: input.fromBot ?? false,
      createdAt: new Date().toISOString(),
    };
    await this.deps.store.addChatMessage(message);
    this.deps.bus.publish({ type: "chat", message });

    if (message.fromBot) return message;
    const parsed = parseChatCommand(input.text);
    if (parsed.kind === "none") return message;
    if (!meeting.modes.text) {
      log.info("chat command ignored: text mode off", { meetingId: meeting.id });
      return message;
    }
    await this.handleCommand(meeting, {
      channel: "text",
      requester: message.sender,
      rawText: message.text,
      parsed,
    });
    return message;
  }

  /** A question typed into the dashboard. Answers are not posted to the meeting. */
  async askFromDashboard(meetingId: string, question: string, asker = "Dashboard"): Promise<CommandRecord> {
    const meeting = await this.requireMeeting(meetingId);
    return this.handleCommand(meeting, {
      channel: "dashboard",
      requester: asker,
      rawText: question,
      parsed: { kind: "question", question },
    });
  }

  async leave(meetingId: string): Promise<Meeting> {
    const meeting = await this.requireMeeting(meetingId);
    if (!meeting.demo && meeting.botId) {
      await this.deps.recall.leaveCall(meeting.botId).catch((error) => {
        log.warn("leave call failed", { meetingId, ...errorFields(error) });
      });
    }
    const updated = await this.updateMeeting(meetingId, {
      status: "ended",
      statusDetail: "Zeno was asked to leave.",
      endedAt: new Date().toISOString(),
      outputMediaActive: false,
    });
    this.setVisual(updated, "idle");
    void this.buildReport(meetingId);
    return updated;
  }

  async buildReport(meetingId: string): Promise<void> {
    const meeting = await this.deps.store.getMeeting(meetingId);
    if (!meeting) return;
    if (await this.deps.store.getReport(meetingId)) return;
    try {
      const [utterances, workspace] = await Promise.all([
        this.deps.store.listUtterances(meetingId, { finalOnly: true }),
        this.deps.provider.getWorkspace(),
      ]);
      const report = await generateReport({
        agent: this.deps.agent,
        meeting,
        utterances,
        workspace,
      });
      await this.deps.store.saveReport(report);
      this.deps.bus.publish({ type: "report", report });
      log.info("report ready", {
        meetingId,
        decisions: report.decisions.length,
        actionItems: report.actionItems.length,
      });
    } catch (error) {
      log.error("report generation failed", { meetingId, ...errorFields(error) });
    }
  }

  // ---------------------------------------------------------------- internals

  private async maybeAnswerSpoken(meeting: Meeting, utterance: Utterance): Promise<void> {
    const parsed = parseVoiceCommand(utterance.text);
    if (parsed.kind === "none") return;

    const state = this.stateFor(meeting.id);
    const key = `${utterance.speaker}:${utterance.text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()}`;
    if (state.deduper.isDuplicate(key)) {
      log.info("wake phrase deduped", { meetingId: meeting.id });
      return;
    }
    if (state.answering || !state.cooldown.ready()) {
      log.info("wake phrase ignored: still speaking", {
        meetingId: meeting.id,
        remainingMs: state.cooldown.remainingMs(),
      });
      return;
    }
    await this.handleCommand(meeting, {
      channel: "voice",
      requester: utterance.speaker,
      rawText: utterance.text,
      parsed,
    });
  }

  private async handleCommand(
    meeting: Meeting,
    input: {
      channel: CommandChannel;
      requester: string;
      rawText: string;
      parsed: { kind: "question"; question: string } | { kind: "confirm" } | { kind: "cancel" };
    },
  ): Promise<CommandRecord> {
    const started = Date.now();
    const state = this.stateFor(meeting.id);
    state.answering = true;

    const command: CommandRecord = {
      id: randomUUID(),
      meetingId: meeting.id,
      channel: input.channel,
      requester: input.requester,
      rawText: input.rawText,
      question: input.parsed.kind === "question" ? input.parsed.question : input.parsed.kind,
      status: "received",
      answer: null,
      spokenAnswer: null,
      issueKeys: [],
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      latencyMs: null,
    };
    await this.deps.store.createCommand(command);
    this.deps.bus.publish({ type: "command", command });
    this.setVisual(meeting, "thinking");

    try {
      const outcome =
        input.parsed.kind === "question"
          ? await this.answerQuestion(meeting, command, input.parsed.question)
          : await this.resolveApproval(meeting, command, input.parsed.kind);

      const finished = await this.deps.store.updateCommand(command.id, {
        status: outcome.status,
        answer: outcome.answer,
        spokenAnswer: outcome.spoken,
        issueKeys: outcome.issueKeys,
        completedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
      });
      this.deps.bus.publish({ type: "command", command: finished });

      await this.deliver(meeting, outcome.answer, outcome.spoken, input.channel);
      return finished;
    } catch (error) {
      log.error("command failed", { meetingId: meeting.id, ...errorFields(error) });
      const failed = await this.deps.store.updateCommand(command.id, {
        status: "failed",
        error: String(error),
        completedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
      });
      this.deps.bus.publish({ type: "command", command: failed });
      await this.deliver(
        meeting,
        "Something went wrong on my side, so I could not answer that.",
        "Something went wrong on my side.",
        input.channel,
      );
      return failed;
    } finally {
      state.answering = false;
      const current = (await this.deps.store.getMeeting(meeting.id)) ?? meeting;
      this.setVisual(current, current.status === "active" && current.modes.voice ? "listening" : "idle");
    }
  }

  private async answerQuestion(
    meeting: Meeting,
    command: CommandRecord,
    question: string,
  ): Promise<{ status: CommandRecord["status"]; answer: string; spoken: string; issueKeys: string[] }> {
    const [transcript, workspace, pending] = await Promise.all([
      this.deps.store.listUtterances(meeting.id, { finalOnly: true }),
      this.deps.provider.getWorkspace(),
      pendingProposal(this.deps.store, meeting.id),
    ]);

    const result = await this.deps.agent.answer({
      question,
      asker: command.requester,
      channel: command.channel,
      spoken: command.channel === "voice",
      meetingTitle: meeting.title,
      transcript,
      workspace,
      pendingApproval: pending,
      toolContext: {
        store: this.deps.store,
        provider: this.deps.provider,
        meetingId: meeting.id,
        commandId: command.id,
        requestedBy: command.requester,
        channel: command.channel,
        onProposal: (approval) => this.deps.bus.publish({ type: "approval", approval }),
      },
    });

    return {
      status: result.approval ? "awaiting_confirmation" : "answered",
      answer: result.answer,
      spoken: result.spokenAnswer,
      issueKeys: result.issueKeys,
    };
  }

  private async resolveApproval(
    meeting: Meeting,
    command: CommandRecord,
    kind: "confirm" | "cancel",
  ): Promise<{ status: CommandRecord["status"]; answer: string; spoken: string; issueKeys: string[] }> {
    const approval = await pendingProposal(this.deps.store, meeting.id);
    if (!approval) {
      const answer = "There is nothing waiting for confirmation right now.";
      return { status: "answered", answer, spoken: answer, issueKeys: [] };
    }

    if (kind === "cancel") {
      const cancelled = await cancelProposal(this.deps.store, approval, command.requester);
      this.deps.bus.publish({ type: "approval", approval: cancelled });
      const answer = `Cancelled. Nothing changed in Jira. (${approval.preview})`;
      return { status: "answered", answer, spoken: "Cancelled, nothing changed in Jira.", issueKeys: keysOf(approval.args) };
    }

    const outcome = await applyProposal(this.deps.store, this.deps.provider, approval, command.requester);
    this.deps.bus.publish({ type: "approval", approval: outcome.approval });
    return {
      status: outcome.ok ? "answered" : "failed",
      answer: outcome.message,
      spoken: fitSpokenAnswer(outcome.message),
      issueKeys: keysOf(approval.args),
    };
  }

  /** Posts to the meeting chat and, in voice mode, speaks through Output Media. */
  private async deliver(
    meeting: Meeting,
    answer: string,
    spoken: string,
    channel: CommandChannel,
  ): Promise<void> {
    if (channel === "dashboard") return;

    if (channel === "voice" && meeting.modes.voice) {
      await this.speak(meeting, spoken);
    }
    // Voice answers also get a short written version, so the room has it in writing.
    const chatText = channel === "voice" ? fitSpokenAnswer(answer, 70) : answer;
    await this.sendChat(meeting, chatText);
  }

  private async sendChat(meeting: Meeting, text: string): Promise<void> {
    const trimmed = text.trim().slice(0, 4000);
    if (!trimmed) return;
    try {
      if (!meeting.demo && meeting.botId) {
        await this.deps.recall.sendChatMessage(meeting.botId, trimmed);
      }
      const message: ChatMessage = {
        id: randomUUID(),
        meetingId: meeting.id,
        sender: "Zeno",
        text: trimmed,
        fromBot: true,
        createdAt: new Date().toISOString(),
      };
      await this.deps.store.addChatMessage(message);
      this.deps.bus.publish({ type: "chat", message });
    } catch (error) {
      log.error("chat reply failed", { meetingId: meeting.id, ...errorFields(error) });
    }
  }

  private async speak(meeting: Meeting, text: string): Promise<void> {
    const state = this.stateFor(meeting.id);
    try {
      const speech = await this.deps.synthesizer.synthesize(text);
      const clipId = this.deps.media.storeClip(speech.audio, speech.contentType);
      const seconds = estimateSpeechSeconds(text);
      this.setVisual(meeting, "responding");
      this.deps.media.publish(meeting.id, {
        type: "speak",
        speechId: clipId,
        text,
        url: `/api/media/${this.mediaToken(meeting)}/clip/${clipId}`,
      });
      state.cooldown.start(seconds * 1000);
      log.info("spoke in meeting", { meetingId: meeting.id, seconds: Math.round(seconds) });
    } catch (error) {
      log.error("speech failed", { meetingId: meeting.id, ...errorFields(error) });
    }
  }

  private setVisual(meeting: Meeting, state: AgentVisualState): void {
    this.deps.media.publish(meeting.id, { type: "state", state });
    this.deps.bus.publish({ type: "agent", state, meetingId: meeting.id });
  }

  private stateFor(meetingId: string): RuntimeState {
    let state = this.runtime.get(meetingId);
    if (!state) {
      state = { deduper: new Deduper(), cooldown: new Cooldown(), answering: false };
      this.runtime.set(meetingId, state);
    }
    return state;
  }

  private async updateMeeting(meetingId: string, patch: Partial<Meeting>): Promise<Meeting> {
    const updated = await this.deps.store.updateMeeting(meetingId, patch);
    this.publishMeeting(updated);
    return updated;
  }

  private publishMeeting(meeting: Meeting): void {
    this.deps.bus.publish({ type: "meeting", meeting });
  }

  private async requireMeeting(meetingId: string): Promise<Meeting> {
    const meeting = await this.deps.store.getMeeting(meetingId);
    if (!meeting) throw new Error(`meeting ${meetingId} not found`);
    return meeting;
  }
}

function keysOf(args: Record<string, unknown>): string[] {
  return typeof args.key === "string" ? [args.key] : [];
}

/** Maps Recall bot status events onto the lifecycle the dashboard shows. */
export function mapStatus(
  event: string,
  subCode: string | null,
): { status: MeetingStatus; detail: string } | null {
  switch (event) {
    case "bot.joining_call":
      return { status: "joining", detail: "Zeno is connecting to the meeting." };
    case "bot.in_waiting_room":
      return { status: "lobby", detail: "Zeno is in the lobby. Someone in the meeting has to admit it." };
    case "bot.in_call_not_recording":
      return { status: "active", detail: "Zeno is in the meeting (not recording yet)." };
    case "bot.recording_permission_allowed":
      return { status: "active", detail: "Recording permission granted." };
    case "bot.recording_permission_denied":
      return {
        status: "active",
        detail: `Recording permission was denied${subCode ? ` (${subCode})` : ""}. Zeno cannot hear the meeting.`,
      };
    case "bot.in_call_recording":
      return { status: "active", detail: "Zeno is in the meeting and listening." };
    case "bot.call_ended":
      return { status: "ended", detail: `The call ended${subCode ? ` (${subCode})` : ""}.` };
    case "bot.done":
      return { status: "ended", detail: "Zeno has left and the recording is available." };
    case "bot.fatal":
      return {
        status: "failed",
        detail: `Zeno could not continue${subCode ? `: ${subCode}` : ""}. Check the bot logs in the Recall dashboard.`,
      };
    default:
      return null;
  }
}

function joinMessage(modes: ModeState): string {
  const lines = ["Zeno is here and taking notes for the follow-up."];
  if (modes.text) lines.push('Ask me anything about the Jira board: type "/zeno" followed by your question.');
  if (modes.voice) lines.push('You can also just say "Zeno" and then your question.');
  lines.push("Any change to Jira needs someone to reply confirm first.");
  return lines.join(" ");
}

function platformOf(meetingUrl: string): string {
  if (/teams\.(microsoft|live)\.com|teams\.cloud\.microsoft/i.test(meetingUrl)) return "Microsoft Teams";
  if (/meet\.google\.com/i.test(meetingUrl)) return "Google Meet";
  if (/zoom\.us/i.test(meetingUrl)) return "Zoom";
  return "Unknown";
}

function defaultTitle(meetingUrl: string, now: Date): string {
  return `${platformOf(meetingUrl)} meeting — ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
