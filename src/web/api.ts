import { useEffect, useRef, useState } from "react";
import type {
  Approval,
  AuditEvent,
  ChatMessage,
  CommandRecord,
  JiraWorkspace,
  LiveEvent,
  Meeting,
  MeetingReport,
  ModeState,
  Utterance,
} from "../shared/types";

export interface MeetingDetail {
  meeting: Meeting;
  utterances: Utterance[];
  chat: ChatMessage[];
  commands: CommandRecord[];
  approvals: Approval[];
  audit: AuditEvent[];
  report: MeetingReport | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`);
  return body as T;
}

export const api = {
  config: () => request<{ recallRegion: string; appBaseUrl: string; liveModel: string; reportModel: string; jiraProvider: string }>("/api/config"),
  listMeetings: () => request<{ meetings: Meeting[] }>("/api/meetings"),
  getMeeting: (id: string) => request<MeetingDetail>(`/api/meetings/${id}`),
  createMeeting: (input: { meetingUrl: string; title?: string; modes: ModeState }) =>
    request<{ meeting: Meeting }>("/api/meetings", { method: "POST", body: JSON.stringify(input) }),
  setModes: (id: string, modes: Partial<ModeState>) =>
    request<{ meeting: Meeting }>(`/api/meetings/${id}/modes`, { method: "PATCH", body: JSON.stringify(modes) }),
  ask: (id: string, question: string) =>
    request<{ command: CommandRecord; approval: Approval | null }>(`/api/meetings/${id}/ask`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),
  decide: (id: string, approvalId: string, decision: "confirm" | "cancel") =>
    request<{ approval: Approval; applied: boolean; message?: string }>(
      `/api/meetings/${id}/approvals/${approvalId}/${decision}`,
      { method: "POST" },
    ),
  mediaUrl: (id: string) => request<{ url: string; streaming: boolean }>(`/api/meetings/${id}/media-url`),
  leave: (id: string) => request<{ meeting: Meeting }>(`/api/meetings/${id}/leave`, { method: "POST" }),
  buildReport: (id: string) => request<{ report: MeetingReport | null }>(`/api/meetings/${id}/report`, { method: "POST" }),
  jira: () => request<{ workspace: JiraWorkspace; provider: string }>("/api/jira"),
  resetJira: () => request<{ workspace: JiraWorkspace }>("/api/jira/reset", { method: "POST" }),
  audit: () => request<{ events: AuditEvent[] }>("/api/jira/audit"),
  createDemo: (modes: ModeState) =>
    request<{ meeting: Meeting }>("/api/demo/meetings", { method: "POST", body: JSON.stringify({ modes }) }),
  runScript: (id: string, speed = 3) =>
    request<{ ok: boolean; lines: number }>(`/api/demo/meetings/${id}/script`, {
      method: "POST",
      body: JSON.stringify({ speed }),
    }),
  demoChat: (id: string, sender: string, text: string) =>
    request<unknown>(`/api/demo/meetings/${id}/chat`, { method: "POST", body: JSON.stringify({ sender, text }) }),
  demoUtterance: (id: string, speaker: string, text: string) =>
    request<unknown>(`/api/demo/meetings/${id}/utterance`, {
      method: "POST",
      body: JSON.stringify({ speaker, text, isFinal: true }),
    }),
  endDemo: (id: string) =>
    request<{ meeting: Meeting; report: MeetingReport | null }>(`/api/demo/meetings/${id}/end`, { method: "POST" }),
};

/** Subscribes to the server event stream; reconnects automatically. */
export function useLiveEvents(onEvent: (event: LiveEvent) => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (event) => {
      try {
        handler.current(JSON.parse(event.data) as LiveEvent);
      } catch {
        // ignore malformed frames
      }
    };
    return () => source.close();
  }, []);
}

/** Tiny hash router: #/control, #/meeting/<id>, #/jira, #/report/<id>. */
export function useHashRoute(): [string[], (path: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash.slice(2) || "control");
  useEffect(() => {
    const listener = () => setHash(window.location.hash.slice(2) || "control");
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  return [hash.split("/").filter(Boolean), (path: string) => { window.location.hash = `#/${path}`; }];
}
