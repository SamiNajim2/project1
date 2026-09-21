import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AccountMenu } from "./account-menu";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 shadow-sm disabled:bg-orange-200 disabled:text-white",
  secondary: "bg-cream-50 text-ink border border-cream-300 hover:border-cream-400 hover:bg-white disabled:text-muted",
  ghost: "text-ink-soft hover:bg-cream-200 disabled:text-muted",
  danger: "text-rose-700 hover:bg-rose-50 disabled:text-muted",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap";

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

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-cream-400 bg-cream-50/60 px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-orange-50 text-orange-600">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 19V5a1 1 0 0 1 1-1h9l6 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
          <path d="M14 4v6h6M8 14h8M8 17h5" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 sm:flex-row sm:items-start">
      <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-rose-700" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5M12 16h.01" strokeLinecap="round" />
      </svg>
      <div className="flex-1">
        <p className="text-sm font-semibold text-rose-700">{title}</p>
        <p className="mt-1 text-sm text-ink-soft">{message}</p>
      </div>
      {action}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "orange" | "green" | "red" }) {
  const tones = {
    neutral: "bg-cream-200 text-ink-soft",
    orange: "bg-orange-100 text-orange-700",
    green: "bg-sage-100 text-sage-700",
    red: "bg-rose-100 text-rose-700",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Strategy Agent home">
      <span className="grid size-8 place-items-center rounded-lg bg-orange-500 text-white shadow-sm transition-transform group-hover:-rotate-6">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M4 17 9.5 11l3.5 3.5L20 7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-ink">Strategy Agent</span>
    </Link>
  );
}

export function Header({ children, account = true }: { children?: ReactNode; account?: boolean }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-cream-300/80 bg-cream-100/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          {children}
          {account && <AccountMenu />}
        </div>
      </div>
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-orange-600">*</span>}
      </label>
      {children}
      {error ? <p className="text-xs text-rose-700">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-cream-300 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100 aria-[invalid=true]:border-rose-700";
