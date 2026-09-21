"use client";

import { useState } from "react";
import { Button, ErrorBanner } from "./ui";

export function BillingButton({
  action,
  label,
  variant = "primary",
  className = "",
}: {
  action: "checkout" | "portal";
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/stripe/${action}`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Something went wrong. Try again.");
      window.location.assign(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant={variant} onClick={go} disabled={busy} className={className}>
        {busy ? (action === "checkout" ? "Opening checkout…" : "Opening billing portal…") : label}
      </Button>
      {error && <ErrorBanner title="Billing error" message={error} />}
    </div>
  );
}
