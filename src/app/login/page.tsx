import { AuthForm } from "@/components/auth-form";
import { Header } from "@/components/ui";
import { safeNextPath } from "@/lib/supabase/config";

export const metadata = { title: "Sign in · Finance Analyst" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  return (
    <>
      <Header account={false} />
      <main className="mx-auto max-w-md px-4 pt-14 pb-20 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-2 mb-8 text-ink-soft">Welcome back. Sign in to open your finance projects.</p>
        <AuthForm mode="login" next={safeNextPath(typeof next === "string" ? next : undefined)} />
      </main>
    </>
  );
}
