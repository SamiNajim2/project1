import { AuthForm } from "@/components/auth-form";
import { Header } from "@/components/ui";

export const metadata = { title: "Create account · Strategy Agent" };

export default function SignupPage() {
  return (
    <>
      <Header account={false} />
      <main className="mx-auto max-w-md px-4 pt-14 pb-20 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Create your account</h1>
        <p className="mt-2 mb-8 text-ink-soft">Next, you subscribe to Strategy Agent Pro for $20/month to start running projects.</p>
        <AuthForm mode="signup" next="/billing" />
      </main>
    </>
  );
}
