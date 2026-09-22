"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AccountMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    await getSupabaseBrowserClient().auth.signOut();
    router.push("/");
    router.refresh();
    setSigningOut(false);
  };

  if (user === undefined) return <span className="skeleton h-9 w-24" aria-hidden="true" />;

  if (!user) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-medium text-ink-soft hover:bg-cream-200">
          Sign in
        </Link>
        <Link href="/signup" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600">
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link href="/projects" className="hidden rounded-xl px-3 py-2 text-sm font-medium text-ink-soft hover:bg-cream-200 sm:inline-flex">
        Projects
      </Link>
      <Link href="/billing" className="rounded-xl px-3 py-2 text-sm font-medium text-ink-soft hover:bg-cream-200">
        Billing
      </Link>
      <span className="hidden max-w-44 truncate px-2 text-xs text-muted lg:inline" title={user.email ?? undefined}>
        {user.email}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm font-medium text-ink hover:border-cream-400 hover:bg-white disabled:text-muted"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
