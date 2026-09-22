import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentVisualState, LiveEvent, Meeting, ModeName } from "../../shared/types";
import { api, useLiveEvents, type MeetingDetail } from "../api";
import { Button, Card, Empty, ModeSwitch, StatusPill, clock } from "../ui";

const MODE_HINTS: Record<ModeName, string> = {
  text: "Chat commands",
  voice: "Wake word + speech",
  video: "Animated brand card",
};

const AGENT_LABEL: Record<AgentVisualState, string> = {
  idle: "Standing by",
  listening: "Listening",
  thinking: "Thinking",
  responding: "Answering",
};

export default function LiveMeeting({ meetingId, meeting, onOpenReport }: {
  meetingId: string | null;
  meeting: Meeting | null;
  onOpenReport: (id: string) => void;
}) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [agentState, setAgentState] = useState<AgentVisualState>("idle");
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!meetingId) return;
    setDetail(await api.getMeeting(meetingId));
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveEvents((event: LiveEvent) => {
    if (!meetingId) return;
    if (event.type === "agent" && event.meetingId === meetingId) setAgentState(event.state);
    const touchesMeeting =
      (event.type === "utterance" && event.utterance.meetingId === meetingId) ||
      (event.type === "chat" && event.message.meetingId === meetingId) ||
      (event.type === "command" && event.command.meetingId === meetingId) ||
      (event.type === "approval" && event.approval.meetingId === meetingId) ||
      (event.type === "report" && event.report.meetingId === meetingId) ||
      (event.type === "meeting" && event.meeting.id === meetingId);
    if (touchesMeeting) void load();
  });

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [detail?.utterances.length]);

  if (!meetingId || !meeting) {
    return <Empty>Pick a meeting in the Control Room first.</Empty>;
  }

  const pending = detail?.approvals.find((approval) => approval.status === "pending") ?? null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMode(mode: ModeName, next: boolean) {
    await run(() => api.setModes(meetingId!, { [mode]: next }));
  }

  async function ask() {
    const text = question.trim();
    if (!text) return;
    setQuestion("");
    await run(() => api.ask(meetingId!, text));
  }

  async function decide(decision: "confirm" | "cancel") {
    if (!pending) return;
    await run(() => api.decide(meetingId!, pending.id, decision));
  }

  return (
    <div className="grid gap-6">
      <Card
        title={meeting.title}
        subtitle={meeting.statusDetail ?? undefined}
        actions={
          <>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-mist-300">
              {AGENT_LABEL[agentState]}
            </span>
            <StatusPill status={meeting.status} />
            {meeting.status !== "ended" && meeting.status !== "failed" && (
              <Button variant="danger" disabled={busy} onClick={() => void run(() => api.leave(meetingId!))}>
                Remove Zeno
              </Button>
            )}
            {meeting.demo && meeting.status !== "ended" && (
              <Button variant="ghost" disabled={busy} onClick={() => void run(() => api.endDemo(meetingId!))}>
                End demo + write follow-up
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                const { url } = await api.mediaUrl(meetingId!);
                window.open(url, "_blank", "noopener,width=1280,height=720");
              }}
            >
              Preview bot video
            </Button>
            <Button variant="ghost" onClick={() => onOpenReport(meetingId!)}>Report</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(MODE_HINTS) as ModeName[]).map((mode) => (
            <ModeSwitch
              key={mode}
              name={mode}
              enabled={meeting.modes[mode]}
              disabled={busy || meeting.status === "ended" || meeting.status === "failed"}
              hint={MODE_HINTS[mode]}
              onChange={(next) => void toggleMode(mode, next)}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-mist-400">
          {meeting.outputMediaActive
            ? "Output Media is streaming the Zeno webpage into the call."
            : "Output Media is off — the bot has no camera feed while voice and video are both off."}
        </p>
      </Card>

      {pending && (
        <Card
          title="Waiting for confirmation"
          subtitle={`Requested by ${pending.requestedBy} · expires ${clock(pending.expiresAt)}`}
          className="border-amber-400/30 bg-amber-400/5"
        >
          <p className="text-sm text-white">{pending.preview}</p>
          <p className="mt-2 text-xs text-mist-400">
            Anyone in the meeting can reply “confirm” or “cancel”. Nothing has changed in Jira yet.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="mint" disabled={busy} onClick={() => void decide("confirm")}>Confirm</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void decide("cancel")}>Cancel</Button>
          </div>
        </Card>
      )}

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card title="Live transcript" subtitle={`${detail?.utterances.length ?? 0} utterances`}>
          <div ref={transcriptRef} className="max-h-[460px] space-y-3 overflow-y-auto pr-2">
            {(detail?.utterances.length ?? 0) === 0 && <Empty>Nothing has been said yet.</Empty>}
            {detail?.utterances.map((utterance) => (
              <div key={utterance.id} className="rounded-xl border border-white/6 bg-white/3 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-accent-400">{utterance.speaker}</span>
                  <span className="text-[11px] text-mist-400">
                    {clock(utterance.receivedAt)}{utterance.isFinal ? "" : " · partial"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-mist-300">{utterance.text}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid min-w-0 content-start gap-6">
          <Card title="Ask Zeno from here" subtitle="Answers stay in the dashboard — nothing is posted to the meeting.">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void ask()}
                placeholder="What is blocking the launch?"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-850 px-4 py-3 text-sm outline-none placeholder:text-mist-400/60 focus:border-accent-500/60"
              />
              <Button onClick={() => void ask()} disabled={busy || !question.trim()}>Ask</Button>
            </div>
          </Card>

          <Card title="Commands" subtitle={`${detail?.commands.length ?? 0} in this meeting`}>
            <div className="max-h-[300px] space-y-3 overflow-y-auto pr-2">
              {(detail?.commands.length ?? 0) === 0 && <Empty>No commands yet.</Empty>}
              {[...(detail?.commands ?? [])].reverse().map((command) => (
                <div key={command.id} className="rounded-xl border border-white/6 bg-white/3 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-widest text-mist-400">
                      {command.channel} · {command.requester}
                    </span>
                    <span className={`text-[11px] ${command.status === "failed" ? "text-rose-300" : "text-mist-400"}`}>
                      {command.status}{command.latencyMs ? ` · ${(command.latencyMs / 1000).toFixed(1)}s` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white">{command.question}</p>
                  {command.answer && <p className="mt-2 whitespace-pre-wrap text-sm text-mist-300">{command.answer}</p>}
                  {command.issueKeys.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {command.issueKeys.map((key) => (
                        <span key={key} className="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] text-accent-400">{key}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Meeting chat" subtitle="What Zeno saw and what it posted back">
            <div className="max-h-[260px] space-y-2 overflow-y-auto pr-2">
              {(detail?.chat.length ?? 0) === 0 && (
                <Empty>
                  {meeting.modes.text && meeting.status === "active" && !meeting.demo
                    ? "No chat events have arrived yet. If this stays empty, the Teams meeting chat is probably not open to anonymous participants, or this is a channel meeting — Zeno cannot read or post chat in either case."
                    : "No chat messages yet."}
                </Empty>
              )}
              {detail?.chat.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl px-4 py-2 text-sm ${
                    message.fromBot ? "border border-accent-500/25 bg-accent-500/10 text-white" : "border border-white/6 bg-white/3 text-mist-300"
                  }`}
                >
                  <span className="text-[11px] uppercase tracking-widest text-mist-400">{message.sender} · {clock(message.createdAt)}</span>
                  <p className="mt-1 whitespace-pre-wrap">{message.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Audit log" subtitle="Every proposal, confirmation and change, with before and after">
        {(detail?.audit.length ?? 0) === 0 ? (
          <Empty>Nothing has been proposed or changed in this meeting.</Empty>
        ) : (
          <ul className="min-w-0 space-y-2">
            {[...(detail?.audit ?? [])].reverse().map((event) => (
              <li key={event.id} className="min-w-0 rounded-xl border border-white/6 bg-white/3 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-white">
                    {event.action}{event.issueKey ? ` · ${event.issueKey}` : ""}
                  </span>
                  <span className="text-[11px] text-mist-400">{event.actor} · {clock(event.createdAt)}</span>
                </div>
                {event.detail && <p className="mt-1 text-mist-300">{event.detail}</p>}
                {(event.before || event.after) && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-950/60 p-3 text-[11px] text-mist-400">
{JSON.stringify({ before: event.before, after: event.after }, null, 1)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
