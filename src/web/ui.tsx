import type { ReactNode } from "react";
import type { MeetingStatus, ModeName } from "../shared/types";

export function Card({ title, subtitle, actions, children, className = "" }: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/8 bg-ink-900/80 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-wide text-mist-300 uppercase">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-mist-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const STATUS_STYLES: Record<MeetingStatus, string> = {
  scheduled: "bg-white/8 text-mist-300 border-white/12",
  joining: "bg-accent-500/15 text-accent-400 border-accent-500/30",
  lobby: "bg-amber-400/12 text-amber-400 border-amber-400/30",
  active: "bg-mint-400/12 text-mint-400 border-mint-400/30",
  ended: "bg-white/6 text-mist-400 border-white/10",
  failed: "bg-rose-500/12 text-rose-300 border-rose-500/30",
};

const STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "Scheduled",
  joining: "Joining",
  lobby: "In lobby",
  active: "In meeting",
  ended: "Ended",
  failed: "Failed",
};

export function StatusPill({ status }: { status: MeetingStatus }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-mint-400 animate-pulse" : "bg-current opacity-70"}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ModeSwitch({ name, enabled, disabled, onChange, hint }: {
  name: ModeName;
  enabled: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  hint: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      title={hint}
      className={`group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${
        enabled
          ? "border-accent-500/40 bg-accent-500/12 text-white"
          : "border-white/10 bg-white/3 text-mist-400 hover:border-white/20"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-widest">{name}</span>
        <span className="mt-0.5 block truncate text-xs text-mist-400">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-accent-500" : "bg-white/12"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${enabled ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, type = "button", className = "" }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "mint";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-accent-500 text-white hover:bg-accent-400 disabled:bg-accent-500/40",
    mint: "bg-mint-400 text-ink-950 font-semibold hover:brightness-110",
    ghost: "border border-white/12 bg-white/4 text-mist-300 hover:border-white/25 hover:text-white",
    danger: "border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-mist-400">{children}</p>;
}

export function clock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
