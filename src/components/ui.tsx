import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-orange-500 text-white hover:bg-orange-600 shadow-sm disabled:bg-orange-200",
  secondary: "bg-cream-50 text-ink border border-cream-300 hover:border-cream-400 hover:bg-white disabled:text-muted",
  ghost: "text-ink-soft hover:bg-cream-200 disabled:text-muted",
  danger: "text-bad hover:bg-bad-bg disabled:text-muted",
};
const BASE = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-cream-300 bg-cream-50 shadow-card ${className}`} {...props} />;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Pill({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "orange" | "good" | "bad" | "warn" | "forecast" | "assumption"; className?: string }) {
  const tones = {
    neutral: "bg-cream-200 text-ink-soft",
    orange: "bg-orange-100 text-orange-700",
    good: "bg-good-bg text-good",
    bad: "bg-bad-bg text-bad",
    warn: "bg-warn-bg text-warn",
    forecast: "bg-forecast-bg text-forecast",
    assumption: "bg-assumption-bg text-assumption",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-cream-400 bg-cream-50/60 px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-orange-50 text-orange-600">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function Banner({ tone, title, children, action }: { tone: "bad" | "warn" | "good" | "info"; title: string; children?: ReactNode; action?: ReactNode }) {
  const tones = {
    bad: "border-bad-bg bg-bad-bg/60 text-bad",
    warn: "border-warn-bg bg-warn-bg/60 text-warn",
    good: "border-good-bg bg-good-bg/60 text-good",
    info: "border-cream-300 bg-cream-50 text-ink",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start ${tones[tone]}`}>
      <div className="flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Finance Analyst home">
      <span className="grid size-8 place-items-center rounded-lg bg-orange-500 text-white shadow-sm transition-transform group-hover:-rotate-6">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M6 18v-6M12 18V6M18 18v-4" strokeLinecap="round" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-ink">Finance Analyst</span>
    </Link>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:bg-cream-100";

export function SectionTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function download(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
