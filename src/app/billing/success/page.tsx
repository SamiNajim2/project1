import { redirect } from "next/navigation";
import { ButtonLink, Card, Header } from "@/components/ui";
import { getStripe, isActive, getSubscription, syncSubscription } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata = { title: "Subscription confirmed · Strategy Agent" };

/** Stripe Checkout returns here. Sync the subscription now rather than waiting for the webhook. */
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/billing");
  const { session_id } = await searchParams;
  if (typeof session_id !== "string" || !session_id.startsWith("cs_")) redirect("/billing");

  let synced = false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(session_id, { expand: ["subscription"] });
    // Only the user who started this checkout may claim it.
    if (session.client_reference_id === user.id && session.subscription && typeof session.subscription !== "string") {
      await syncSubscription(session.subscription, user.id);
    }
    synced = isActive(await getSubscription(user.id));
  } catch (error) {
    console.error("[checkout success] sync failed:", error);
  }

  if (synced) redirect("/projects?welcome=1");

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 pt-16 pb-20 sm:px-6">
        <Card className="p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">Payment received</h1>
          <p className="mt-3 text-sm text-ink-soft">
            Stripe is still confirming your subscription. This usually takes a few seconds. Refresh this page, or check the billing page.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <ButtonLink href={`/billing/success?session_id=${session_id}`}>Refresh</ButtonLink>
            <ButtonLink href="/billing" variant="secondary">
              Billing
            </ButtonLink>
          </div>
        </Card>
      </main>
    </>
  );
}
