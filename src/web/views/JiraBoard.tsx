import { useCallback, useEffect, useState } from "react";
import type { AuditEvent, JiraWorkspace } from "../../shared/types";
import { api, useLiveEvents } from "../api";
import { Button, Card, Empty, clock } from "../ui";

const STATUS_ACCENT: Record<string, string> = {
  Backlog: "border-white/10",
  "To Do": "border-white/15",
  "In Progress": "border-accent-500/40",
  "In Review": "border-amber-400/40",
  Blocked: "border-rose-500/40",
  Done: "border-mint-400/40",
};

export default function JiraBoard() {
  const [workspace, setWorkspace] = useState<JiraWorkspace | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ workspace: data }, { events }] = await Promise.all([api.jira(), api.audit()]);
    setWorkspace(data);
    setAudit(events);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveEvents((event) => {
    if (event.type === "audit" || event.type === "approval") void load();
  });

  if (!workspace) return <Empty>Loading the board…</Empty>;

  return (
    <div className="grid gap-6">
      <Card
        title={`${workspace.company} · ${workspace.project.name}`}
        subtitle={`${workspace.board.sprint} (${workspace.board.sprint_start} → ${workspace.board.sprint_end}) · release ${workspace.board.release_date}`}
        actions={
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.resetJira();
                await load();
              } finally {
                setBusy(false);
              }
            }}
          >
            Reset board to seed
          </Button>
        }
      >
        <p className="text-sm text-mist-300">{workspace.board.sprint_goal}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {workspace.users.map((user) => (
            <span key={user.accountId} className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-mist-300">
              {user.displayName} · <span className="text-mist-400">{user.role}</span>
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspace.board.statuses.map((status) => {
          const issues = workspace.issues.filter((issue) => issue.status === status);
          return (
            <div key={status} className={`min-w-0 rounded-2xl border bg-ink-900/70 ${STATUS_ACCENT[status] ?? "border-white/10"}`}>
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                <h3 className="text-sm font-semibold text-white">{status}</h3>
                <span className="text-xs text-mist-400">{issues.length}</span>
              </div>
              <div className="space-y-2 p-3">
                {issues.length === 0 && <p className="px-1 py-4 text-center text-xs text-mist-400">Empty</p>}
                {issues.map((issue) => (
                  <article key={issue.key} className="rounded-xl border border-white/6 bg-white/3 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-accent-400">{issue.key}</span>
                      <span className="text-[10px] uppercase tracking-widest text-mist-400">{issue.type} · {issue.priority}</span>
                    </div>
                    <p className="mt-1 text-sm text-white">{issue.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-mist-400">
                      <span>{issue.assignee ?? "Unassigned"}</span>
                      {issue.dueDate && <span>· due {issue.dueDate}</span>}
                      {issue.storyPoints !== null && <span>· {issue.storyPoints} pts</span>}
                    </div>
                    {issue.labels.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {issue.labels.map((label) => (
                          <span key={label} className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-mist-300">{label}</span>
                        ))}
                      </div>
                    )}
                    {issue.comments.length > 0 && (
                      <p className="mt-2 border-t border-white/6 pt-2 text-[11px] text-mist-400">
                        {issue.comments.length} comment{issue.comments.length > 1 ? "s" : ""} · last from {issue.comments.at(-1)!.author}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Card title="Change history" subtitle="Every write Zeno proposed, and what actually happened">
        {audit.length === 0 ? (
          <Empty>Nothing has been proposed or changed yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {audit.map((event) => (
              <li key={event.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-white/6 bg-white/3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-white">{event.action}</span>
                  {event.issueKey && <span className="ml-2 text-accent-400">{event.issueKey}</span>}
                  {event.detail && <span className="mt-1 block truncate text-mist-400">{event.detail}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-mist-400">{event.actor} · {clock(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
