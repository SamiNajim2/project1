import { redirect } from "next/navigation";
import { BillingButton } from "@/components/billing-actions";
import { ButtonLink, Card, Header, Pill } from "@/components/ui";
import { PLAN, isActive, isStripeTestMode, refreshSubscription } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata = { title: "Billing · Finance Analyst" };

function formatDate(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/billing");
  // Always read fresh from Stripe here: this is where users land after the portal or a failed payment.
  const [{ canceled }, sub] = await Promise.all([searchParams, refreshSubscription(user.id)]);
  const active = isActive(sub);
  const periodEnd = formatDate(sub?.current_period_end ?? null);
  const troubled = sub?.status === "past_due" || sub?.status === "unpaid";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 pt-12 pb-20 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Billing</h1>
        <p className="mt-2 mb-8 text-ink-soft">Signed in as {user.email}</p>

        {canceled === "1" && !active && (
          <div className="mb-6 rounded-xl border border-cream-300 bg-cream-50 p-4 text-sm text-ink-soft">Checkout was canceled. You have not been charged.</div>
        )}

        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">{PLAN.name}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-semibold text-ink">${PLAN.amount}</span>
                <span className="text-muted">/ {PLAN.interval}</span>
              </p>
            </div>
            {active ? (
              <Pill tone="good">{sub?.cancel_at_period_end ? "Active until period end" : "Active"}</Pill>
            ) : troubled ? (
              <Pill tone="bad">Payment issue</Pill>
            ) : (
              <Pill>Not subscribed</Pill>
            )}
          </div>

          {active ? (
            <>
              <p className="mt-5 text-sm text-ink-soft">
                {sub?.cancel_at_period_end
                  ? `Your subscription is canceled and ends on ${periodEnd ?? "the end of the billing period"}. You keep full access until then.`
                  : `Your subscription renews on ${periodEnd ?? "the next billing date"}.`}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/projects">Open your projects</ButtonLink>
                <BillingButton action="portal" label="Manage subscription" variant="secondary" />
              </div>
            </>
          ) : troubled ? (
            <>
              <p className="mt-5 text-sm text-ink-soft">Your last payment did not go through. Update your payment method to restore access.</p>
              <div className="mt-6">
                <BillingButton action="portal" label="Update payment method" />
              </div>
            </>
          ) : (
            <>
              <p className="mt-5 text-sm text-ink-soft">
                Subscribe to use Finance Analyst: import and validate your files, verified variance analysis, three-scenario forecasts, cash
                runway, the MRR bridge, and AI-drafted investor updates and board packs. Billed monthly in {PLAN.currency}, no free trial, cancel anytime.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <BillingButton action="checkout" label={`Subscribe for $${PLAN.amount}/month`} className="px-6 py-2.5" />
                {sub?.stripe_customer_id && <BillingButton action="portal" label="Billing history" variant="secondary" />}
              </div>
            </>
          )}
        </Card>

        {isStripeTestMode() && !active && (
          <div className="mt-6 rounded-xl border border-amber-100 bg-amber-100/50 p-4 text-sm text-ink-soft">
            <strong className="text-amber-800">Stripe sandbox.</strong> No real money is charged. Pay with card{" "}
            <span className="font-mono">4242 4242 4242 4242</span>, any future expiry date and any CVC.
          </div>
        )}
      </main>
    </>
  );
}
