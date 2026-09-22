import { randomUUID } from "node:crypto";
import type {
  Approval,
  AuditEvent,
  CommandChannel,
  JiraWriteTool,
} from "../../shared/types.js";
import type { Store } from "../db/store.js";
import { JiraError, type JiraProvider } from "../jira/provider.js";
import { log } from "../lib/logger.js";

export const APPROVAL_TTL_MS = 5 * 60 * 1000;

export interface ProposalInput {
  meetingId: string;
  commandId: string | null;
  tool: JiraWriteTool;
  args: Record<string, unknown>;
  requestedBy: string;
  channel: CommandChannel;
}

/**
 * Every Jira write goes through here first. Nothing is written until a human
 * replies "confirm", and a proposal expires five minutes after it was made.
 */
export async function createProposal(
  store: Store,
  provider: JiraProvider,
  input: ProposalInput,
  now = new Date(),
): Promise<Approval> {
  const preview = await describeChange(provider, input.tool, input.args);
  const approval: Approval = {
    id: randomUUID(),
    meetingId: input.meetingId,
    commandId: input.commandId,
    tool: input.tool,
    args: input.args,
    preview,
    status: "pending",
    requestedBy: input.requestedBy,
    channel: input.channel,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
    resolvedAt: null,
    error: null,
  };
  await store.createApproval(approval);
  await recordAudit(store, {
    meetingId: input.meetingId,
    actor: input.requestedBy,
    action: `proposed:${input.tool}`,
    issueKey: typeof input.args.key === "string" ? input.args.key : null,
    before: null,
    after: input.args,
    detail: preview,
  });
  return approval;
}

/** Returns the live pending proposal for a meeting, expiring it if its time is up. */
export async function pendingProposal(
  store: Store,
  meetingId: string,
  now = new Date(),
): Promise<Approval | null> {
  const approval = await store.findPendingApproval(meetingId);
  if (!approval) return null;
  if (new Date(approval.expiresAt).getTime() <= now.getTime()) {
    const expired = await store.updateApproval(approval.id, {
      status: "expired",
      resolvedAt: now.toISOString(),
    });
    await recordAudit(store, {
      meetingId,
      actor: "zeno",
      action: `expired:${approval.tool}`,
      issueKey: typeof approval.args.key === "string" ? approval.args.key : null,
      before: null,
      after: null,
      detail: `Proposal expired unconfirmed after ${APPROVAL_TTL_MS / 60000} minutes.`,
    });
    log.info("approval expired", { approvalId: expired.id, meetingId });
    return null;
  }
  return approval;
}

export interface ApplyOutcome {
  ok: boolean;
  message: string;
  approval: Approval;
}

/**
 * Applies a confirmed proposal. Success is only ever reported after the provider
 * itself returns success; a provider error is surfaced verbatim.
 */
export async function applyProposal(
  store: Store,
  provider: JiraProvider,
  approval: Approval,
  confirmedBy: string,
  now = new Date(),
): Promise<ApplyOutcome> {
  try {
    const result = await runWrite(provider, approval);
    const applied = await store.updateApproval(approval.id, {
      status: "applied",
      resolvedAt: now.toISOString(),
    });
    await recordAudit(store, {
      meetingId: approval.meetingId,
      actor: confirmedBy,
      action: `applied:${approval.tool}`,
      issueKey: result.issue.key,
      before: result.before,
      after: result.after,
      detail: approval.preview,
    });
    log.info("jira write applied", {
      approvalId: approval.id,
      tool: approval.tool,
      issueKey: result.issue.key,
      provider: provider.name,
    });
    return { ok: true, message: describeApplied(approval.tool, result.issue.key, approval.args), approval: applied };
  } catch (error) {
    const message = error instanceof JiraError ? error.message : `the Jira provider rejected the change (${String(error)})`;
    const failed = await store.updateApproval(approval.id, {
      status: "failed",
      resolvedAt: now.toISOString(),
      error: message,
    });
    await recordAudit(store, {
      meetingId: approval.meetingId,
      actor: confirmedBy,
      action: `failed:${approval.tool}`,
      issueKey: typeof approval.args.key === "string" ? approval.args.key : null,
      before: null,
      after: approval.args,
      detail: message,
    });
    log.warn("jira write failed", { approvalId: approval.id, tool: approval.tool, error: message });
    return { ok: false, message: `That did not go through: ${message}`, approval: failed };
  }
}

export async function cancelProposal(
  store: Store,
  approval: Approval,
  cancelledBy: string,
  now = new Date(),
): Promise<Approval> {
  const cancelled = await store.updateApproval(approval.id, {
    status: "cancelled",
    resolvedAt: now.toISOString(),
  });
  await recordAudit(store, {
    meetingId: approval.meetingId,
    actor: cancelledBy,
    action: `cancelled:${approval.tool}`,
    issueKey: typeof approval.args.key === "string" ? approval.args.key : null,
    before: null,
    after: approval.args,
    detail: approval.preview,
  });
  return cancelled;
}

async function runWrite(provider: JiraProvider, approval: Approval) {
  const args = approval.args;
  const key = typeof args.key === "string" ? args.key : "";
  switch (approval.tool) {
    case "createIssue":
      return provider.createIssue(args as never);
    case "updateIssue":
      return provider.updateIssue(key, (args.fields ?? {}) as never);
    case "transitionIssue":
      return provider.transitionIssue(key, String(args.status ?? ""));
    case "assignIssue":
      return provider.assignIssue(key, args.assignee === null ? null : String(args.assignee ?? ""));
    case "addComment":
      return provider.addComment(key, String(args.body ?? ""), String(args.author ?? "Zeno"));
  }
}

/** The exact proposed change, shown to the meeting before anyone can confirm it. */
export async function describeChange(
  provider: JiraProvider,
  tool: JiraWriteTool,
  args: Record<string, unknown>,
): Promise<string> {
  const key = typeof args.key === "string" ? args.key.toUpperCase() : null;
  const issue = key ? await provider.getIssue(key) : null;
  const title = issue ? `${issue.key} "${issue.summary}"` : (key ?? "a new issue");

  switch (tool) {
    case "transitionIssue": {
      const from = issue?.status ?? "unknown";
      return `Move ${title} from ${from} to ${String(args.status)}.`;
    }
    case "assignIssue": {
      const from = issue?.assignee ?? "Unassigned";
      const to = args.assignee === null ? "Unassigned" : String(args.assignee);
      return `Reassign ${title} from ${from} to ${to}.`;
    }
    case "addComment":
      return `Add a comment to ${title}: "${truncate(String(args.body ?? ""), 240)}".`;
    case "updateIssue": {
      const fields = (args.fields ?? {}) as Record<string, unknown>;
      const parts = Object.entries(fields).map(([field, value]) => {
        const before = issue ? (issue as unknown as Record<string, unknown>)[field] : undefined;
        return `${field}: ${formatValue(before)} → ${formatValue(value)}`;
      });
      return `Update ${title} — ${parts.join("; ")}.`;
    }
    case "createIssue": {
      const bits = [
        `type ${String(args.type ?? "Task")}`,
        `priority ${String(args.priority ?? "Medium")}`,
        args.assignee ? `assignee ${String(args.assignee)}` : "unassigned",
        args.dueDate ? `due ${String(args.dueDate)}` : null,
      ].filter(Boolean);
      return `Create a new issue "${String(args.summary ?? "")}" (${bits.join(", ")}).`;
    }
  }
}

function describeApplied(tool: JiraWriteTool, issueKey: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "transitionIssue":
      return `Done — ${issueKey} is now ${String(args.status)}.`;
    case "assignIssue":
      return `Done — ${issueKey} is assigned to ${args.assignee === null ? "nobody" : String(args.assignee)}.`;
    case "addComment":
      return `Done — comment added to ${issueKey}.`;
    case "updateIssue":
      return `Done — ${issueKey} updated.`;
    case "createIssue":
      return `Done — created ${issueKey}.`;
  }
}

export async function recordAudit(
  store: Store,
  event: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string },
): Promise<AuditEvent> {
  return store.addAuditEvent({
    id: randomUUID(),
    createdAt: event.createdAt ?? new Date().toISOString(),
    meetingId: event.meetingId,
    actor: event.actor,
    action: event.action,
    issueKey: event.issueKey,
    before: event.before,
    after: event.after,
    detail: event.detail,
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "empty";
  return truncate(String(value), 120);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
