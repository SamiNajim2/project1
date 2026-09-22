import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
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
import { log } from "../lib/logger.js";
import { NotFoundError, type Store } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Each row keeps its queryable columns plus the full record as jsonb, so the
 * schema stays small while the stored record always matches the TypeScript type.
 */
export class PostgresStore implements Store {
  private readonly pool: pg.Pool;

  constructor(
    connectionString: string,
    private readonly seed: JiraWorkspace,
  ) {
    this.pool = new pg.Pool({
      connectionString,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
    this.pool.on("error", (error) => log.error("postgres pool error", { error: error.message }));
  }

  async init(): Promise<void> {
    const schema = readSchema();
    await this.pool.query(schema);
    await this.pool.query(
      "insert into zeno.jira_workspace (id, data) values (1, $1) on conflict (id) do nothing",
      [JSON.stringify(this.seed)],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createMeeting(meeting: Meeting): Promise<Meeting> {
    await this.pool.query(
      `insert into zeno.meetings (id, bot_id, status, demo, created_at, updated_at, data)
       values ($1, $2, $3, $4, $5, now(), $6)`,
      [meeting.id, meeting.botId, meeting.status, meeting.demo, meeting.createdAt, JSON.stringify(meeting)],
    );
    return meeting;
  }

  async updateMeeting(id: string, patch: Partial<Meeting>): Promise<Meeting> {
    const current = await this.getMeeting(id);
    if (!current) throw new NotFoundError(`meeting ${id}`);
    const updated: Meeting = { ...current, ...patch, id };
    await this.pool.query(
      `update zeno.meetings set bot_id = $2, status = $3, updated_at = now(), data = $4 where id = $1`,
      [id, updated.botId, updated.status, JSON.stringify(updated)],
    );
    return updated;
  }

  async getMeeting(id: string): Promise<Meeting | null> {
    const { rows } = await this.pool.query<{ data: Meeting }>(
      "select data from zeno.meetings where id = $1",
      [id],
    );
    return rows[0]?.data ?? null;
  }

  async getMeetingByBotId(botId: string): Promise<Meeting | null> {
    const { rows } = await this.pool.query<{ data: Meeting }>(
      "select data from zeno.meetings where bot_id = $1",
      [botId],
    );
    return rows[0]?.data ?? null;
  }

  async listMeetings(limit = 50): Promise<Meeting[]> {
    const { rows } = await this.pool.query<{ data: Meeting }>(
      "select data from zeno.meetings order by created_at desc limit $1",
      [limit],
    );
    return rows.map((row) => row.data);
  }

  async addUtterance(utterance: Utterance): Promise<Utterance> {
    await this.pool.query(
      `insert into zeno.utterances (id, meeting_id, is_final, received_at, data)
       values ($1, $2, $3, $4, $5)`,
      [utterance.id, utterance.meetingId, utterance.isFinal, utterance.receivedAt, JSON.stringify(utterance)],
    );
    return utterance;
  }

  async listUtterances(meetingId: string, options?: { finalOnly?: boolean }): Promise<Utterance[]> {
    const { rows } = await this.pool.query<{ data: Utterance }>(
      `select data from zeno.utterances
       where meeting_id = $1 and ($2::boolean is not true or is_final)
       order by received_at asc`,
      [meetingId, options?.finalOnly ?? false],
    );
    return rows.map((row) => row.data);
  }

  async addChatMessage(message: ChatMessage): Promise<ChatMessage> {
    await this.pool.query(
      `insert into zeno.chat_messages (id, meeting_id, from_bot, created_at, data)
       values ($1, $2, $3, $4, $5)`,
      [message.id, message.meetingId, message.fromBot, message.createdAt, JSON.stringify(message)],
    );
    return message;
  }

  async listChatMessages(meetingId: string): Promise<ChatMessage[]> {
    const { rows } = await this.pool.query<{ data: ChatMessage }>(
      "select data from zeno.chat_messages where meeting_id = $1 order by created_at asc",
      [meetingId],
    );
    return rows.map((row) => row.data);
  }

  async createCommand(command: CommandRecord): Promise<CommandRecord> {
    await this.pool.query(
      `insert into zeno.commands (id, meeting_id, status, created_at, data) values ($1, $2, $3, $4, $5)`,
      [command.id, command.meetingId, command.status, command.createdAt, JSON.stringify(command)],
    );
    return command;
  }

  async updateCommand(id: string, patch: Partial<CommandRecord>): Promise<CommandRecord> {
    const { rows } = await this.pool.query<{ data: CommandRecord }>(
      "select data from zeno.commands where id = $1",
      [id],
    );
    const current = rows[0]?.data;
    if (!current) throw new NotFoundError(`command ${id}`);
    const updated: CommandRecord = { ...current, ...patch, id };
    await this.pool.query("update zeno.commands set status = $2, data = $3 where id = $1", [
      id,
      updated.status,
      JSON.stringify(updated),
    ]);
    return updated;
  }

  async listCommands(meetingId: string): Promise<CommandRecord[]> {
    const { rows } = await this.pool.query<{ data: CommandRecord }>(
      "select data from zeno.commands where meeting_id = $1 order by created_at asc",
      [meetingId],
    );
    return rows.map((row) => row.data);
  }

  async createApproval(approval: Approval): Promise<Approval> {
    await this.pool.query(
      `insert into zeno.approvals (id, meeting_id, status, created_at, expires_at, data)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        approval.id,
        approval.meetingId,
        approval.status,
        approval.createdAt,
        approval.expiresAt,
        JSON.stringify(approval),
      ],
    );
    return approval;
  }

  async updateApproval(id: string, patch: Partial<Approval>): Promise<Approval> {
    const current = await this.getApproval(id);
    if (!current) throw new NotFoundError(`approval ${id}`);
    const updated: Approval = { ...current, ...patch, id };
    await this.pool.query("update zeno.approvals set status = $2, data = $3 where id = $1", [
      id,
      updated.status,
      JSON.stringify(updated),
    ]);
    return updated;
  }

  async getApproval(id: string): Promise<Approval | null> {
    const { rows } = await this.pool.query<{ data: Approval }>(
      "select data from zeno.approvals where id = $1",
      [id],
    );
    return rows[0]?.data ?? null;
  }

  async listApprovals(meetingId?: string): Promise<Approval[]> {
    const { rows } = meetingId
      ? await this.pool.query<{ data: Approval }>(
          "select data from zeno.approvals where meeting_id = $1 order by created_at asc",
          [meetingId],
        )
      : await this.pool.query<{ data: Approval }>(
          "select data from zeno.approvals order by created_at desc limit 200",
        );
    return rows.map((row) => row.data);
  }

  async findPendingApproval(meetingId: string): Promise<Approval | null> {
    const { rows } = await this.pool.query<{ data: Approval }>(
      `select data from zeno.approvals
       where meeting_id = $1 and status = 'pending'
       order by created_at desc limit 1`,
      [meetingId],
    );
    return rows[0]?.data ?? null;
  }

  async addAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    await this.pool.query(
      "insert into zeno.audit_events (id, meeting_id, created_at, data) values ($1, $2, $3, $4)",
      [event.id, event.meetingId, event.createdAt, JSON.stringify(event)],
    );
    return event;
  }

  async listAuditEvents(meetingId?: string, limit = 200): Promise<AuditEvent[]> {
    const { rows } = meetingId
      ? await this.pool.query<{ data: AuditEvent }>(
          "select data from zeno.audit_events where meeting_id = $1 order by created_at asc limit $2",
          [meetingId, limit],
        )
      : await this.pool.query<{ data: AuditEvent }>(
          "select data from zeno.audit_events order by created_at desc limit $1",
          [limit],
        );
    return rows.map((row) => row.data);
  }

  async saveReport(report: MeetingReport): Promise<MeetingReport> {
    await this.pool.query(
      `insert into zeno.reports (meeting_id, created_at, data) values ($1, $2, $3)
       on conflict (meeting_id) do update set created_at = excluded.created_at, data = excluded.data`,
      [report.meetingId, report.createdAt, JSON.stringify(report)],
    );
    return report;
  }

  async getReport(meetingId: string): Promise<MeetingReport | null> {
    const { rows } = await this.pool.query<{ data: MeetingReport }>(
      "select data from zeno.reports where meeting_id = $1",
      [meetingId],
    );
    return rows[0]?.data ?? null;
  }

  async getJira(): Promise<JiraWorkspace> {
    const { rows } = await this.pool.query<{ data: JiraWorkspace }>(
      "select data from zeno.jira_workspace where id = 1",
    );
    return rows[0]?.data ?? this.seed;
  }

  /** Row-level lock so two confirmations can never interleave on the same workspace. */
  async withJira<T>(mutate: (workspace: JiraWorkspace) => T): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<{ data: JiraWorkspace }>(
        "select data from zeno.jira_workspace where id = 1 for update",
      );
      const workspace = rows[0]?.data ?? structuredClone(this.seed);
      const result = mutate(workspace);
      await client.query(
        `insert into zeno.jira_workspace (id, updated_at, data) values (1, now(), $1)
         on conflict (id) do update set updated_at = now(), data = excluded.data`,
        [JSON.stringify(workspace)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async resetJira(workspace: JiraWorkspace): Promise<void> {
    await this.pool.query(
      `insert into zeno.jira_workspace (id, updated_at, data) values (1, now(), $1)
       on conflict (id) do update set updated_at = now(), data = excluded.data`,
      [JSON.stringify(workspace)],
    );
  }
}

function needsSsl(connectionString: string): boolean {
  // Railway's private network and local Postgres do not use TLS; managed hosts do.
  if (/sslmode=disable/.test(connectionString)) return false;
  if (/railway\.internal/.test(connectionString)) return false;
  if (/@(localhost|127\.0\.0\.1)/.test(connectionString)) return false;
  return true;
}

function readSchema(): string {
  // Resolves both from src (tsx) and dist (compiled), where the .sql sits beside the .js.
  for (const candidate of [resolve(here, "schema.sql"), resolve(here, "../../../src/server/db/schema.sql")]) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error("Could not locate zeno schema.sql");
}
