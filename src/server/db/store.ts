import type {
  Approval,
  AuditEvent,
  ChatMessage,
  CommandRecord,
  JiraWorkspace,
  Meeting,
  MeetingReport,
  Utterance,
} from "../../shared/types.js";

/**
 * Everything the app persists. Two implementations: Postgres (production) and an
 * in-process store used by tests and by `DATABASE_URL=memory:` demo runs.
 */
export interface Store {
  init(): Promise<void>;
  close(): Promise<void>;

  createMeeting(meeting: Meeting): Promise<Meeting>;
  updateMeeting(id: string, patch: Partial<Meeting>): Promise<Meeting>;
  getMeeting(id: string): Promise<Meeting | null>;
  getMeetingByBotId(botId: string): Promise<Meeting | null>;
  listMeetings(limit?: number): Promise<Meeting[]>;

  addUtterance(utterance: Utterance): Promise<Utterance>;
  listUtterances(meetingId: string, options?: { finalOnly?: boolean }): Promise<Utterance[]>;

  addChatMessage(message: ChatMessage): Promise<ChatMessage>;
  listChatMessages(meetingId: string): Promise<ChatMessage[]>;

  createCommand(command: CommandRecord): Promise<CommandRecord>;
  updateCommand(id: string, patch: Partial<CommandRecord>): Promise<CommandRecord>;
  listCommands(meetingId: string): Promise<CommandRecord[]>;

  createApproval(approval: Approval): Promise<Approval>;
  updateApproval(id: string, patch: Partial<Approval>): Promise<Approval>;
  getApproval(id: string): Promise<Approval | null>;
  listApprovals(meetingId?: string): Promise<Approval[]>;
  /** The one approval a "confirm" in this meeting would apply, if any. */
  findPendingApproval(meetingId: string): Promise<Approval | null>;

  addAuditEvent(event: AuditEvent): Promise<AuditEvent>;
  listAuditEvents(meetingId?: string, limit?: number): Promise<AuditEvent[]>;

  saveReport(report: MeetingReport): Promise<MeetingReport>;
  getReport(meetingId: string): Promise<MeetingReport | null>;

  getJira(): Promise<JiraWorkspace>;
  /** Applies `mutate` to the workspace atomically and returns its result. */
  withJira<T>(mutate: (workspace: JiraWorkspace) => T): Promise<T>;
  resetJira(workspace: JiraWorkspace): Promise<void>;
}

export class NotFoundError extends Error {}

export function isMemoryUrl(databaseUrl: string): boolean {
  return databaseUrl === "memory:" || databaseUrl.startsWith("memory:");
}
