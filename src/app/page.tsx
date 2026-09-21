import { ButtonLink, Card, Header } from "@/components/ui";
import { PLAN, getSubscription, isActive } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";

const FEATURES = [
  ["Live research", "Plans the research, searches the web and reads your PDFs, notes and URLs."],
  ["Every claim cited", "Facts link to their source. Estimates and assumptions are labeled; gaps say “More evidence needed”."],
  ["Decision-ready", "Competitors, segments, three options, an editable recommendation, a business case and a 90-day plan."],
] as const;

const INCLUDED = [
  "Strategy projects with live web research",
  "Competitor comparison and customer segments",
  "Three strategic options and an editable recommendation",
  "Business case with labeled assumptions and a 90-day plan",
  "Markdown export and a presentation outline",
];

export default async function Landing() {
  const user = await getSessionUser();
  const subscribed = user ? isActive(await getSubscription(user.id).catch(() => null)) : false;
  const cta = subscribed
    ? { href: "/projects", label: "Open your projects" }
    : user
      ? { href: "/billing", label: `Subscribe for $${PLAN.amount}/month` }
      : { href: "/signup", label: "Get started" };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <section className="py-12 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-orange-600">AI strategy consultant</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-6xl">
            Turn a company brief into a strategy you can defend.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-soft">
            Strategy Agent researches the market, compares competitors, develops three options and recommends one, with sources for every fact.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={cta.href} className="px-6 py-3 text-base">
              {cta.label}
            </ButtonLink>
            {!user && (
              <ButtonLink href="/login" variant="secondary" className="px-6 py-3 text-base">
                Sign in
              </ButtonLink>
            )}
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {FEATURES.map(([title, text], i) => (
              <div key={title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-orange-100 font-display text-sm font-semibold text-orange-700">{i + 1}</span>
                <div>
                  <p className="font-semibold text-ink">{title}</p>
                  <p className="mt-0.5 text-sm text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-24 border-t border-cream-300 pt-14">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 id="pricing-heading" className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                One plan. Everything included.
              </h2>
              <p className="mt-3 max-w-md text-ink-soft">
                Subscribe to run strategy projects on any company and market. Billed monthly through Stripe. Cancel anytime from your billing page.
              </p>
            </div>
            <Card className="p-7 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">{PLAN.name}</p>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="font-display text-5xl font-semibold text-ink">${PLAN.amount}</span>
                <span className="text-muted">/ {PLAN.interval}</span>
              </p>
              <p className="mt-1 text-sm text-muted">{PLAN.currency}, billed monthly. No free trial.</p>
              <ul className="mt-6 space-y-2.5 text-sm text-ink-soft">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-orange-600" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <ButtonLink href={cta.href} className="mt-7 w-full py-3 text-base">
                {cta.label}
              </ButtonLink>
            </Card>
          </div>
        </section>
      </main>
    </>
  );
}
