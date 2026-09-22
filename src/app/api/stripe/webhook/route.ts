import type Stripe from "stripe";
import { getStripe, syncSubscriptionById } from "@/lib/server/billing";

/** Keeps the subscriptions table in step with Stripe: new, renewed, changed and cancelled subscriptions. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return Response.json({ error: "Webhook not configured." }, { status: 500 });
  }
  if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscriptionById(id, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscriptionById(event.data.object.id);
        break;
      default:
        break;
    }
  } catch (error) {
    // A 500 makes Stripe retry the event with backoff.
    console.error(`[webhook] ${event.type} ${event.id} failed:`, error);
    return Response.json({ error: "Handler failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
