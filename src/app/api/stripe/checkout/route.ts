import { ensureCustomer, getStripe, getSubscription, isActive, requirePriceId } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";

/** Starts Stripe Checkout for the $20/month plan and returns the hosted checkout URL. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to subscribe." }, { status: 401 });

  try {
    if (isActive(await getSubscription(user.id))) return Response.json({ url: "/projects" });

    const origin = new URL(request.url).origin;
    const customer = await ensureCustomer(user);
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: requirePriceId(), quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id },
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?canceled=1`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("[checkout] failed:", error);
    return Response.json({ error: "Could not start checkout. Try again." }, { status: 500 });
  }
}
