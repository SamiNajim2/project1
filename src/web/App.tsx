import { useCallback, useEffect, useMemo, useState } from "react";
import type { LiveEvent, Meeting } from "../shared/types";
import { api, useHashRoute, useLiveEvents } from "./api";
import ControlRoom from "./views/ControlRoom";
import LiveMeeting from "./views/LiveMeeting";
import JiraBoard from "./views/JiraBoard";
import ReportView from "./views/ReportView";

export interface AppConfig {
  recallRegion: string;
  appBaseUrl: string;
  liveModel: string;
  reportModel: string;
  jiraProvider: string;
}

const NAV = [
  { key: "control", label: "Control Room" },
  { key: "meeting", label: "Live Meeting" },
  { key: "jira", label: "Mock Jira" },
  { key: "report", label: "Meeting Report" },
];

export default function App() {
  const [route, navigate] = useHashRoute();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const refreshMeetings = useCallback(async () => {
    const { meetings: list } = await api.listMeetings();
    setMeetings(list);
    return list;
  }, []);

  useEffect(() => {
    void refreshMeetings();
    void api.config().then(setConfig).catch(() => undefined);
  }, [refreshMeetings]);

  useLiveEvents((event: LiveEvent) => {
    if (event.type === "meeting") {
      setMeetings((current) => {
        const rest = current.filter((meeting) => meeting.id !== event.meeting.id);
        return [event.meeting, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    }
  });

  const view = route[0] ?? "control";
  const selectedId = route[1] ?? meetings[0]?.id ?? null;
  const selected = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedId) ?? null,
    [meetings, selectedId],
  );

  return (
    <div className="min-h-full bg-[radial-gradient(1100px_600px_at_15%_-10%,rgba(79,107,255,0.18),transparent_60%),radial-gradient(900px_600px_at_90%_10%,rgba(53,220,184,0.10),transparent_55%)]">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
          <button onClick={() => navigate("control")} className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent-400 to-mint-400 text-base font-bold text-ink-950">Z</span>
            <span className="text-left">
              <span className="block text-base font-semibold leading-tight">Zeno</span>
              <span className="block text-[11px] uppercase tracking-[0.2em] text-mist-400">Meeting Intelligence</span>
            </span>
          </button>

          <nav className="flex min-w-0 flex-1 flex-wrap gap-1">
            {NAV.map((item) => {
              const target = item.key === "meeting" || item.key === "report"
                ? selectedId ? `${item.key}/${selectedId}` : item.key
                : item.key;
              const active = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(target)}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    active ? "bg-white/10 text-white" : "text-mist-400 hover:bg-white/5 hover:text-mist-300"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {config && (
            <div className="hidden text-right text-[11px] leading-tight text-mist-400 lg:block">
              <div>Recall region <span className="text-mist-300">{config.recallRegion}</span></div>
              <div>Jira provider <span className="text-mist-300">{config.jiraProvider}</span></div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {view === "control" && (
          <ControlRoom
            meetings={meetings}
            config={config}
            onRefresh={refreshMeetings}
            onOpen={(id) => navigate(`meeting/${id}`)}
          />
        )}
        {view === "meeting" && (
          <LiveMeeting
            meetingId={selectedId}
            meeting={selected}
            onOpenReport={(id) => navigate(`report/${id}`)}
          />
        )}
        {view === "jira" && <JiraBoard />}
        {view === "report" && <ReportView meetingId={selectedId} meeting={selected} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-mist-400 sm:px-6">
        Zeno answers only from the live transcript and the mock Jira workspace. Every Jira write needs a spoken or typed confirmation.
      </footer>
    </div>
  );
}
