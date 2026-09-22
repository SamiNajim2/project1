/** Payload shapes documented for Recall.ai API schema v1.11. */

export interface RecallParticipant {
  id: number;
  name: string | null;
  is_host: boolean | null;
  platform: string | null;
  extra_data: Record<string, unknown> | null;
  email: string | null;
}

export interface TranscriptWord {
  text: string;
  start_timestamp: { relative: number } | null;
  end_timestamp: { relative: number } | null;
}

/** `transcript.data` — a finalized utterance delivered during the meeting. */
export interface TranscriptDataEvent {
  event: "transcript.data" | "transcript.partial_data";
  data: {
    data: {
      words: TranscriptWord[];
      language_code?: string;
      participant: RecallParticipant;
    };
    realtime_endpoint?: { id: string; metadata: Record<string, unknown> };
    transcript?: { id: string; metadata: Record<string, unknown> };
    recording?: { id: string; metadata: Record<string, unknown> };
    bot: { id: string; metadata: Record<string, unknown> };
  };
}

/** `participant_events.chat_message` — someone typed in the meeting chat. */
export interface ChatMessageEvent {
  event: "participant_events.chat_message";
  data: {
    data: {
      participant: RecallParticipant;
      timestamp: { absolute: string; relative: number };
      data: { text: string; to: string };
    };
    realtime_endpoint?: { id: string; metadata: Record<string, unknown> };
    participant_events?: { id: string; metadata: Record<string, unknown> };
    recording?: { id: string; metadata: Record<string, unknown> };
    bot: { id: string; metadata: Record<string, unknown> };
  };
}

export interface ParticipantEvent {
  event:
    | "participant_events.join"
    | "participant_events.leave"
    | "participant_events.update"
    | "participant_events.speech_on"
    | "participant_events.speech_off"
    | "participant_events.webcam_on"
    | "participant_events.webcam_off"
    | "participant_events.screenshare_on"
    | "participant_events.screenshare_off";
  data: {
    data: { participant: RecallParticipant; timestamp: { absolute: string; relative: number } };
    bot: { id: string; metadata: Record<string, unknown> };
    recording?: { id: string; metadata: Record<string, unknown> };
  };
}

export type RealtimeEvent = TranscriptDataEvent | ChatMessageEvent | ParticipantEvent;

/** Bot status change webhook, delivered to the endpoint configured in the dashboard. */
export interface BotStatusChangeEvent {
  event: string; // bot.joining_call, bot.in_waiting_room, bot.in_call_recording, ...
  data: {
    data: { code: string; sub_code: string | null; updated_at: string };
    bot: { id: string; metadata: Record<string, unknown> };
  };
}

export interface CreateBotResponse {
  id: string;
  bot_name?: string;
  status_changes?: { code: string; sub_code: string | null; created_at: string }[];
  recordings?: { id: string }[];
  metadata?: Record<string, unknown>;
}
