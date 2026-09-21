import { redirect } from "next/navigation";
import { ButtonLink, Card, Header, Spinner } from "@/components/ui";
import { getStripe, isActive, getSubscription, syncSubscription } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata = { title: "Confirming subscription · Strategy Agent" };

const ATTEMPTS = 4;
const RETRY_MS = 1500;

/** Stripe Checkout returns here. Sync the subscription now rather than waiting for the webhook. */
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/billing");
  const { session_id } = await searchParams;
  if (typeof session_id !== "string" || !session_id.startsWith("cs_")) redirect("/billing");

  let synced = false;
  let detail = "";
  for (let attempt = 1; attempt <= ATTEMPTS && !synced; attempt++) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id, { expand: ["subscription"] });
      // Only the user who started this checkout may claim it.
      if (session.client_reference_id !== user.id) {
        detail = "session belongs to another user";
        break;
      }
      if (session.subscription && typeof session.subscription !== "string") {
        await syncSubscription(session.subscription, user.id);
        detail = `session ${session.status}/${session.payment_status}, subscription ${session.subscription.status}`;
      } else {
        detail = `session ${session.status}/${session.payment_status}, no subscription yet`;
      }
      synced = isActive(await getSubscription(user.id));
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    if (!synced && attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_MS));
  }

  if (synced) redirect("/projects?welcome=1");
  console.warn(`[checkout success] not active yet for ${user.id}: ${detail}`);

  return (
    <>
      <Header />
      {/* Re-check automatically; the webhook or Stripe usually confirms within seconds. */}
      <meta httpEquiv="refresh" content="4" />
      <main className="mx-auto max-w-lg px-4 pt-16 pb-20 sm:px-6">
        <Card className="p-8 text-center">
          <Spinner className="mx-auto size-6 text-orange-600" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Confirming your subscription</h1>
          <p className="mt-3 text-sm text-ink-soft">Your payment went through. Stripe is finishing the subscription; this page checks again automatically.</p>
          <div className="mt-6 flex justify-center">
            <ButtonLink href="/billing" variant="secondary" prefetch={false}>
              Go to billing
            </ButtonLink>
          </div>
        </Card>
      </main>
    </>
  );
}
