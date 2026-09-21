import "server-only";
import type { User } from "@supabase/supabase-js";
import Stripe from "stripe";
import { getSupabaseAdmin } from "../supabase/server";

export const PLAN = { name: "Strategy Agent Pro", amount: 20, currency: "USD", interval: "month" } as const;

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
}

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set on the server.");
  stripe ??= new Stripe(key, { appInfo: { name: "Strategy Agent" } });
  return stripe;
}

export function isStripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

export function requirePriceId(): string {
  const price = process.env.STRIPE_PRICE_ID;
  if (!price) throw new Error("STRIPE_PRICE_ID is not set on the server.");
  return price;
}

export function isActive(row: SubscriptionRow | null): boolean {
  return !!row?.status && ACTIVE_STATUSES.has(row.status);
}

export async function getSubscription(userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await getSupabaseAdmin().from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Could not read subscription: ${error.message}`);
  return (data as SubscriptionRow | null) ?? null;
}

async function upsertRow(row: Partial<SubscriptionRow> & { user_id: string }) {
  const { error } = await getSupabaseAdmin()
    .from("subscriptions")
    .upsert({ ...row, updated_at: new Date().toISOString() } as never, { onConflict: "user_id" });
  if (error) throw new Error(`Could not save subscription: ${error.message}`);
}

/** Returns the user's Stripe customer, creating it (once) if needed. */
export async function ensureCustomer(user: User): Promise<string> {
  const existing = await getSubscription(user.id);
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;
  const customer = await getStripe().customers.create(
    { email: user.email, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await upsertRow({ user_id: user.id, stripe_customer_id: customer.id });
  return customer.id;
}

async function userIdForCustomer(customerId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

/**
 * Mirrors a Stripe subscription into the subscriptions table. Always pass a subscription freshly
 * retrieved from Stripe: webhook events can arrive out of order, the API is the source of truth.
 */
export async function syncSubscription(subscription: Stripe.Subscription, userIdHint?: string | null) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const userId = userIdHint || subscription.metadata?.user_id || (await userIdForCustomer(customerId));
  if (!userId) {
    console.warn(`[billing] No user for subscription ${subscription.id} (customer ${customerId}); skipped.`);
    return;
  }

  // A stale event for an old subscription must not overwrite a newer active one.
  const current = await getSubscription(userId);
  if (
    current?.stripe_subscription_id &&
    current.stripe_subscription_id !== subscription.id &&
    isActive(current) &&
    !ACTIVE_STATUSES.has(subscription.status)
  ) {
    return;
  }

  // Since API version 2025-03-31 the billing period lives on the subscription item.
  const item = subscription.items.data[0];
  await upsertRow({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    price_id: item?.price.id ?? null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end || subscription.cancel_at !== null,
  });
}

export async function syncSubscriptionById(subscriptionId: string, userIdHint?: string | null) {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await syncSubscription(subscription, userIdHint);
  return subscription;
}

/** Re-reads the user's subscription from Stripe, so access stays correct even if a webhook was missed. */
export async function refreshSubscription(userId: string): Promise<SubscriptionRow | null> {
  const row = await getSubscription(userId);
  if (!row?.stripe_customer_id) return row;
  const stripe = getStripe();
  let subscription: Stripe.Subscription | undefined = row.stripe_subscription_id
    ? await stripe.subscriptions.retrieve(row.stripe_subscription_id)
    : undefined;
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) {
    // The customer may have subscribed again, or the checkout return never reached us.
    const { data } = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: "all", limit: 10 });
    subscription = data.find((s) => ACTIVE_STATUSES.has(s.status)) ?? subscription ?? data[0];
  }
  if (subscription) await syncSubscription(subscription, userId);
  return getSubscription(userId);
}

/** The paywall check. Re-checks Stripe once the paid period has ended (renewal or cancellation). */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  let row = await getSubscription(userId);
  if (isActive(row) && row?.current_period_end && new Date(row.current_period_end).getTime() < Date.now()) {
    row = await refreshSubscription(userId);
  }
  return isActive(row);
}
