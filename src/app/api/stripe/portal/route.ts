import { getStripe, getSubscription } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";

/** Opens the Stripe customer portal (payment method, invoices, cancellation). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to manage billing." }, { status: 401 });

  try {
    const row = await getSubscription(user.id);
    if (!row?.stripe_customer_id) return Response.json({ error: "No billing account yet. Subscribe first." }, { status: 404 });
    const session = await getStripe().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${new URL(request.url).origin}/billing`,
      ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID } : {}),
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("[portal] failed:", error);
    return Response.json({ error: "Could not open the billing portal. Try again." }, { status: 500 });
  }
}
