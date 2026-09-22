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
import { NotFoundError, type Store } from "./store.js";

const clone = <T>(value: T): T => structuredClone(value);

/** In-process store: used by tests and by `DATABASE_URL=memory:` demo runs. */
export class MemoryStore implements Store {
  private meetings = new Map<string, Meeting>();
  private utterances: Utterance[] = [];
  private chat: ChatMessage[] = [];
  private commands = new Map<string, CommandRecord>();
  private approvals = new Map<string, Approval>();
  private audit: AuditEvent[] = [];
  private reports = new Map<string, MeetingReport>();
  private jira: JiraWorkspace | null = null;

  constructor(private readonly seed: JiraWorkspace) {}

  async init(): Promise<void> {
    if (!this.jira) this.jira = clone(this.seed);
  }
  async close(): Promise<void> {}

  async createMeeting(meeting: Meeting): Promise<Meeting> {
    this.meetings.set(meeting.id, clone(meeting));
    return clone(meeting);
  }
  async updateMeeting(id: string, patch: Partial<Meeting>): Promise<Meeting> {
    const existing = this.meetings.get(id);
    if (!existing) throw new NotFoundError(`meeting ${id}`);
    const updated = { ...existing, ...clone(patch), id: existing.id };
    this.meetings.set(id, updated);
    return clone(updated);
  }
  async getMeeting(id: string): Promise<Meeting | null> {
    return this.meetings.has(id) ? clone(this.meetings.get(id)!) : null;
  }
  async getMeetingByBotId(botId: string): Promise<Meeting | null> {
    for (const meeting of this.meetings.values()) {
      if (meeting.botId === botId) return clone(meeting);
    }
    return null;
  }
  async listMeetings(limit = 50): Promise<Meeting[]> {
    return [...this.meetings.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  async addUtterance(utterance: Utterance): Promise<Utterance> {
    this.utterances.push(clone(utterance));
    return clone(utterance);
  }
  async listUtterances(meetingId: string, options?: { finalOnly?: boolean }): Promise<Utterance[]> {
    return this.utterances
      .filter((u) => u.meetingId === meetingId && (!options?.finalOnly || u.isFinal))
      .map(clone);
  }

  async addChatMessage(message: ChatMessage): Promise<ChatMessage> {
    this.chat.push(clone(message));
    return clone(message);
  }
  async listChatMessages(meetingId: string): Promise<ChatMessage[]> {
    return this.chat.filter((m) => m.meetingId === meetingId).map(clone);
  }

  async createCommand(command: CommandRecord): Promise<CommandRecord> {
    this.commands.set(command.id, clone(command));
    return clone(command);
  }
  async updateCommand(id: string, patch: Partial<CommandRecord>): Promise<CommandRecord> {
    const existing = this.commands.get(id);
    if (!existing) throw new NotFoundError(`command ${id}`);
    const updated = { ...existing, ...clone(patch), id: existing.id };
    this.commands.set(id, updated);
    return clone(updated);
  }
  async listCommands(meetingId: string): Promise<CommandRecord[]> {
    return [...this.commands.values()]
      .filter((c) => c.meetingId === meetingId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }

  async createApproval(approval: Approval): Promise<Approval> {
    this.approvals.set(approval.id, clone(approval));
    return clone(approval);
  }
  async updateApproval(id: string, patch: Partial<Approval>): Promise<Approval> {
    const existing = this.approvals.get(id);
    if (!existing) throw new NotFoundError(`approval ${id}`);
    const updated = { ...existing, ...clone(patch), id: existing.id };
    this.approvals.set(id, updated);
    return clone(updated);
  }
  async getApproval(id: string): Promise<Approval | null> {
    return this.approvals.has(id) ? clone(this.approvals.get(id)!) : null;
  }
  async listApprovals(meetingId?: string): Promise<Approval[]> {
    return [...this.approvals.values()]
      .filter((a) => !meetingId || a.meetingId === meetingId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }
  async findPendingApproval(meetingId: string): Promise<Approval | null> {
    const pending = [...this.approvals.values()]
      .filter((a) => a.meetingId === meetingId && a.status === "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return pending[0] ? clone(pending[0]) : null;
  }

  async addAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    this.audit.push(clone(event));
    return clone(event);
  }
  async listAuditEvents(meetingId?: string, limit = 200): Promise<AuditEvent[]> {
    return this.audit
      .filter((e) => !meetingId || e.meetingId === meetingId)
      .slice(-limit)
      .map(clone);
  }

  async saveReport(report: MeetingReport): Promise<MeetingReport> {
    this.reports.set(report.meetingId, clone(report));
    return clone(report);
  }
  async getReport(meetingId: string): Promise<MeetingReport | null> {
    return this.reports.has(meetingId) ? clone(this.reports.get(meetingId)!) : null;
  }

  async getJira(): Promise<JiraWorkspace> {
    if (!this.jira) this.jira = clone(this.seed);
    return clone(this.jira);
  }
  async withJira<T>(mutate: (workspace: JiraWorkspace) => T): Promise<T> {
    if (!this.jira) this.jira = clone(this.seed);
    const draft = clone(this.jira);
    const result = mutate(draft);
    this.jira = draft;
    return clone(result);
  }
  async resetJira(workspace: JiraWorkspace): Promise<void> {
    this.jira = clone(workspace);
  }
}
