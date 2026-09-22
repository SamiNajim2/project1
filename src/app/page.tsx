import { ButtonLink, Card, Header } from "@/components/ui";
import { PLAN, hasActiveSubscription } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";

const FEATURES = [
  ["Import & map", "Excel and CSV files are read in your browser, kept unchanged, and mapped to a standard finance model."],
  ["Verify every number", "Deterministic calculations with the formula and source cell behind each figure. Totals are reconciled; anything untraceable is marked UNVERIFIED."],
  ["Report", "Variances, three-scenario forecast, runway and MRR bridge, plus an investor update and board-pack section drafted from verified figures only."],
] as const;

const INCLUDED = [
  "Excel and CSV import with column mapping and a data-quality report",
  "Actual vs budget and prior-period variance, month and year to date",
  "Base, upside and downside forecasts with cash runway",
  "MRR bridge with retention and ARR",
  "AI-drafted investor update and board-pack section from verified figures",
  "Markdown report and CSV exports after human review",
];

export default async function Landing() {
  const user = await getSessionUser();
  const subscribed = user ? await hasActiveSubscription(user.id).catch(() => false) : false;
  const cta = subscribed ? { href: "/projects", label: "Open your projects" } : user ? { href: "/billing", label: `Subscribe for $${PLAN.amount}/month` } : { href: "/signup", label: "Get started" };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="py-12 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-orange-600">FP&A workbench</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">From spreadsheets to a board pack you can trace to the cell.</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Upload actuals, budget, cash and MRR files. Finance Analyst validates them, reconciles totals, and produces variance analysis, forecasts, runway and reporting where every number shows its source.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href={cta.href} className="px-6 py-3 text-base">
              {cta.label}
            </ButtonLink>
            {!user && (
              <ButtonLink href="/login" variant="secondary" className="px-6 py-3 text-base">
                Sign in
              </ButtonLink>
            )}
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
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
              <p className="mt-3 max-w-md text-ink-soft">Subscribe to analyse your company&apos;s files and produce verified reporting. Billed monthly through Stripe. Cancel anytime from your billing page.</p>
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
