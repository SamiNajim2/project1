import { useCallback, useEffect, useState } from "react";
import type { Meeting, MeetingReport } from "../../shared/types";
import { api, useLiveEvents } from "../api";
import { Button, Card, Empty } from "../ui";

export default function ReportView({ meetingId, meeting }: { meetingId: string | null; meeting: Meeting | null }) {
  const [report, setReport] = useState<MeetingReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!meetingId) return;
    const detail = await api.getMeeting(meetingId);
    setReport(detail.report);
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveEvents((event) => {
    if (event.type === "report" && event.report.meetingId === meetingId) setReport(event.report);
  });

  if (!meetingId || !meeting) return <Empty>Pick a meeting first.</Empty>;

  async function regenerate() {
    setBusy(true);
    try {
      const { report: fresh } = await api.buildReport(meetingId!);
      if (fresh) setReport(fresh);
      else await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card
        title="Meeting follow-up"
        subtitle={meeting.title}
        actions={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => void regenerate()}>
              {report ? "Regenerate" : "Generate"}
            </Button>
            {report && (
              <>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(report.markdown);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? "Copied" : "Copy Markdown"}
                </Button>
                <a
                  href={`/api/meetings/${meetingId}/report.md`}
                  className="rounded-xl bg-mint-400 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:brightness-110"
                >
                  Download .md
                </a>
              </>
            )}
          </>
        }
      >
        {!report ? (
          <Empty>
            {meeting.status === "ended"
              ? "No follow-up yet — generate it."
              : "The follow-up is written when the meeting ends. You can generate it early."}
          </Empty>
        ) : (
          <p className="text-sm text-mist-300">{report.headline}</p>
        )}
      </Card>

      {report && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Decisions">
            {report.decisions.length === 0 ? (
              <Empty>No decisions were recorded.</Empty>
            ) : (
              <ul className="space-y-3">
                {report.decisions.map((decision, index) => (
                  <li key={index} className="rounded-xl border border-white/6 bg-white/3 px-4 py-3">
                    <p className="text-sm text-white">{decision.decision}</p>
                    <p className="mt-1 text-xs text-mist-400">“{decision.evidence}”</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Action items">
            {report.actionItems.length === 0 ? (
              <Empty>No action items were recorded.</Empty>
            ) : (
              <ul className="space-y-3">
                {report.actionItems.map((item, index) => (
                  <li key={index} className="rounded-xl border border-white/6 bg-white/3 px-4 py-3">
                    <p className="text-sm text-white">{item.description}</p>
                    <p className="mt-1 text-xs text-mist-400">
                      Owner: <span className="text-mist-300">{item.owner ?? "not named"}</span> · Deadline:{" "}
                      <span className="text-mist-300">{item.deadline ?? "not stated"}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Unresolved questions">
            {report.unresolvedQuestions.length === 0 ? (
              <Empty>Nothing was left open.</Empty>
            ) : (
              <ul className="space-y-2">
                {report.unresolvedQuestions.map((question, index) => (
                  <li key={index} className="rounded-xl border border-white/6 bg-white/3 px-4 py-3 text-sm text-mist-300">
                    {question}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Proposed Jira changes" subtitle="Proposals only — each still needs a confirmation">
            {report.proposedJiraChanges.length === 0 ? (
              <Empty>No Jira changes were proposed.</Empty>
            ) : (
              <ul className="space-y-3">
                {report.proposedJiraChanges.map((change, index) => (
                  <li key={index} className="rounded-xl border border-white/6 bg-white/3 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] text-accent-400">
                        {change.issueKey ?? "new issue"}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-mist-400">{change.tool}</span>
                    </div>
                    <p className="mt-2 text-sm text-white">{change.summary}</p>
                    <p className="mt-1 text-xs text-mist-400">“{change.evidence}”</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Markdown export" className="lg:col-span-2">
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-ink-950/70 p-4 text-xs text-mist-300">
{report.markdown}
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
}
