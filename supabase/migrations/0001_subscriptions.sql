-- Stripe subscription state per user. Written only by the server (secret key, bypasses RLS)
-- from the Stripe webhook and the checkout success page; users can read their own row.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "Users read their own subscription" on public.subscriptions;
create policy "Users read their own subscription"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- RLS does not cover TRUNCATE, and anonymous visitors never need this table.
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
revoke select on public.subscriptions from anon;
