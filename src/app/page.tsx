import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Melange — Errand Marketplace
        </h1>
        <p className="text-slate-600 dark:text-slate-300">
          A student errand marketplace built around a closed-loop trust
          framework: multi-criteria runner matching, a time-decayed reputation
          model, rule-based fraud detection, and rule-based dispute resolution
          with AI-assisted human escalation.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {[
          ["Matching", "Normalized multi-criteria weighted-sum ranking."],
          ["Trust", "Time-decayed reputation with Bayesian cold-start."],
          ["Fraud", "Explainable rule-based detection, two-tier response."],
          ["Arbitration", "Rule-based resolution, confidence-gated escalation."],
        ].map(([title, body]) => (
          <div
            key={title}
            className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
          >
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p>
          </div>
        ))}
      </section>

      <div>
        <Link
          href="/demo/matching"
          className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
        >
          View the matching demo →
        </Link>
      </div>
    </main>
  );
}
