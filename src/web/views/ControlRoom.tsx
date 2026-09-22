import { useState } from "react";
import type { Meeting, ModeState } from "../../shared/types";
import type { AppConfig } from "../App";
import { api } from "../api";
import { Button, Card, Empty, ModeSwitch, StatusPill, clock } from "../ui";

const MODE_HINTS = {
  text: "Answers /zeno commands in the meeting chat",
  voice: 'Speaks answers after the wake word "Zeno"',
  video: "Streams the branded Zeno card into the call",
} as const;

export default function ControlRoom({ meetings, config, onRefresh, onOpen }: {
  meetings: Meeting[];
  config: AppConfig | null;
  onRefresh: () => Promise<Meeting[]>;
  onOpen: (id: string) => void;
}) {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [title, setTitle] = useState("");
  const [modes, setModes] = useState<ModeState>({ text: true, voice: false, video: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const { meeting } = await api.createMeeting({ meetingUrl: meetingUrl.trim(), title: title.trim() || undefined, modes });
      setMeetingUrl("");
      setTitle("");
      await onRefresh();
      onOpen(meeting.id);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  async function startDemo() {
    setBusy(true);
    setError(null);
    try {
      const { meeting } = await api.createDemo(modes);
      await api.runScript(meeting.id, 3);
      await onRefresh();
      onOpen(meeting.id);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-6">
        <Card title="Send Zeno to a meeting" subtitle="Paste the Microsoft Teams link. Zeno joins as a participant named Zeno.">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-widest text-mist-400">Meeting link</span>
              <input
                value={meetingUrl}
                onChange={(event) => setMeetingUrl(event.target.value)}
                placeholder="https://teams.microsoft.com/l/meetup-join/..."
                className="w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-3 text-sm outline-none placeholder:text-mist-400/60 focus:border-accent-500/60"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-widest text-mist-400">Title (optional)</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Atlas Launch — Sprint 12 standup"
                className="w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-3 text-sm outline-none placeholder:text-mist-400/60 focus:border-accent-500/60"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(MODE_HINTS) as (keyof typeof MODE_HINTS)[]).map((mode) => (
                <ModeSwitch
                  key={mode}
                  name={mode}
                  enabled={modes[mode]}
                  hint={MODE_HINTS[mode]}
                  onChange={(next) => setModes((current) => ({ ...current, [mode]: next }))}
                />
              ))}
            </div>

            {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={send} disabled={busy || meetingUrl.trim().length === 0} variant="mint">
                {busy ? "Working…" : "Send Zeno"}
              </Button>
              <Button onClick={startDemo} disabled={busy} variant="ghost">
                Run a demo meeting
              </Button>
              <span className="text-xs text-mist-400">
                Demo mode replays a scripted standup — no Teams call, no bot.
              </span>
            </div>
          </div>
        </Card>

        <Card title="Meetings" subtitle="Newest first" actions={<Button variant="ghost" onClick={() => void onRefresh()}>Refresh</Button>}>
          {meetings.length === 0 ? (
            <Empty>No meetings yet. Send Zeno to a Teams call, or run the demo meeting.</Empty>
          ) : (
            <ul className="grid gap-2">
              {meetings.map((meeting) => (
                <li key={meeting.id}>
                  <button
                    onClick={() => onOpen(meeting.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-left transition hover:border-white/20"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{meeting.title}</span>
                      <span className="block truncate text-xs text-mist-400">
                        {meeting.platform} · {clock(meeting.createdAt)} · {meeting.statusDetail ?? ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {meeting.demo && <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] uppercase tracking-widest text-mist-400">Demo</span>}
                      {(["text", "voice", "video"] as const)
                        .filter((mode) => meeting.modes[mode])
                        .map((mode) => (
                          <span key={mode} className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-accent-400">
                            {mode}
                          </span>
                        ))}
                      <StatusPill status={meeting.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid min-w-0 content-start gap-6">
        <Card title="How Zeno behaves">
          <ul className="grid gap-3 text-sm text-mist-300">
            <li><span className="text-white">Text</span> — anyone types <code className="rounded bg-white/8 px-1.5 py-0.5 text-xs">/zeno show launch blockers</code> in the meeting chat and the answer comes back in the chat.</li>
            <li><span className="text-white">Voice</span> — someone says <span className="text-white">“Zeno, summarize Sprint 12.”</span> The wake word only counts at the start of a sentence.</li>
            <li><span className="text-white">Video</span> — the bot streams the Zeno card: it animates while listening and answering.</li>
            <li>Every Jira write is proposed first. Someone has to reply <span className="text-white">confirm</span> within five minutes.</li>
            <li>If the answer is not in the transcript or on the board, Zeno says it cannot verify it.</li>
          </ul>
        </Card>

        {config && (
          <Card title="Runtime">
            <dl className="grid gap-2 text-sm">
              {[
                ["Recall region", config.recallRegion],
                ["Public base URL", config.appBaseUrl],
                ["Live model", config.liveModel],
                ["Report model", config.reportModel],
                ["Jira provider", config.jiraProvider],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-white/5 pb-2 last:border-0">
                  <dt className="text-mist-400">{label}</dt>
                  <dd className="min-w-0 truncate text-mist-300">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-mist-400">
              Status webhooks are delivered to <code className="rounded bg-white/8 px-1 py-0.5">{config.appBaseUrl}/api/webhooks/recall/status</code>, configured in the Recall dashboard. Transcript and chat events go to <code className="rounded bg-white/8 px-1 py-0.5">/api/webhooks/recall/realtime</code>, configured per bot.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
