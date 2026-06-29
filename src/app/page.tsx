import {
  ShoppingCart,
  ShoppingBasket,
  Pill,
  Shirt,
  PackageOpen,
  House,
  Gift,
  Sparkles,
  ShieldCheck,
  EyeOff,
  BadgeCheck,
  Clock,
  Wallet,
  Smile,
  ClipboardList,
  UserCheck,
  PackageCheck,
  Star,
  ArrowRight,
  Phone,
  MessageCircle,
  Check,
  X,
  Camera,
  type LucideIcon,
} from "lucide-react";

const WHATSAPP = "https://wa.me/233557644244";
const PHONE = "tel:+233557644244";

const services: { icon: LucideIcon; title: string; blurb: string }[] = [
  { icon: ShoppingCart, title: "Market Runs", blurb: "Fresh produce, groceries, provisions & more" },
  { icon: ShoppingBasket, title: "Grocery Shopping", blurb: "Supermarkets, bulk buying, monthly restocking" },
  { icon: Pill, title: "Pharmacy Pickup", blurb: "Medicines, toiletries, drugs & personal care" },
  { icon: Shirt, title: "Clothes & Apparel", blurb: "Fashion, shoes, accessories for every occasion" },
  { icon: PackageOpen, title: "Pickup & Delivery", blurb: "Documents, packages, items, drop-offs & more" },
  { icon: House, title: "Household Items", blurb: "Everything you need for your home" },
  { icon: Gift, title: "Gifts & Occasions", blurb: "Birthdays, surprises, celebrations & more" },
  { icon: Sparkles, title: "Any Other Errand", blurb: "Just tell us what you need — we'll handle it" },
];

const steps: { icon: LucideIcon; title: string; blurb: string }[] = [
  { icon: ClipboardList, title: "Post your errand", blurb: "Tell us what you need run, where, and your budget." },
  { icon: UserCheck, title: "We match a runner", blurb: "A trusted, nearby runner is matched by distance, rating & availability." },
  { icon: PackageCheck, title: "Track, get proof, pay", blurb: "Follow it live, get photo proof on delivery, then pay securely." },
];

const trust: { icon: LucideIcon; title: string; blurb: string }[] = [
  { icon: ShieldCheck, title: "Reliable", blurb: "You can count on us" },
  { icon: EyeOff, title: "Discreet", blurb: "Your privacy matters" },
  { icon: BadgeCheck, title: "Professional", blurb: "Quality service always" },
  { icon: Clock, title: "On time", blurb: "Punctual & efficient" },
  { icon: Wallet, title: "Affordable", blurb: "Fair pricing always" },
  { icon: Smile, title: "Friendly", blurb: "Service with a smile" },
];

const testimonials: { quote: string; name: string; tag: string }[] = [
  {
    quote: "We made our first delivery today — fast and stress-free. Thank you for trusting us!",
    name: "Ama K.",
    tag: "Market run, Accra",
  },
  {
    quote: "Picked up my prescription and dropped it at my door while I was at work. Lifesaver.",
    name: "Kofi A.",
    tag: "Pharmacy pickup",
  },
  {
    quote: "Sent a birthday gift across town in an hour. The runner even sent a photo on delivery.",
    name: "Esi M.",
    tag: "Gifts & occasions",
  },
];

const exceptions = [
  "No handling of illegal items",
  "No cash lending or financial transactions on behalf of clients",
  "No purchase of restricted items without proper authorisation",
  "No banking transactions requiring PINs or passwords",
];

// Hand-drawn marker underline (echoes the brand flyer's orange swoosh).
function HandUnderline({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 18"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      <path
        d="M4 12.5C61 6 121 4.5 180 6.5c40 1.4 80 3.6 116 6.5"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Editorial eyebrow: small label, a rule, and a small label on the right.
function EyebrowRule({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted sm:gap-4 sm:text-xs sm:tracking-[0.18em]">
      <span className="shrink-0">{left}</span>
      <span className="h-px min-w-3 flex-1 bg-cream-deep" />
      <span className="shrink-0">{right}</span>
    </div>
  );
}

function Logo() {
  return (
    <span className="inline-flex items-baseline gap-1 font-display text-2xl font-semibold tracking-tight text-green-deep">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-green text-cream">
        <ShoppingBasket className="h-4 w-4" aria-hidden />
      </span>
      Mélange
    </span>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Logo />
          <div className="hidden items-center gap-8 text-sm font-medium text-green-deep md:flex">
            <a href="#services" className="hover:text-orange-deep">Services</a>
            <a href="#how" className="hover:text-orange-deep">How it works</a>
            <a href="#pricing" className="hover:text-orange-deep">Pricing</a>
          </div>
          <a
            href="#get-started"
            className="rounded-full bg-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-deep"
          >
            Post an errand
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 pt-10">
          <EyebrowRule left="Concierge errands" right="Accra & beyond" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-10 md:grid-cols-2 md:pb-24">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-green/10 px-4 py-1.5 text-sm font-medium text-green-deep">
              <Sparkles className="h-4 w-4" aria-hidden />
              Busy schedule? I&apos;m here to help.
            </span>
            <h1 className="font-display text-fluid-hero font-semibold tracking-tight text-green-deep">
              Errands,{" "}
              <span className="relative inline-block italic text-orange">
                run for you.
                <HandUnderline className="absolute -bottom-2 left-0 h-3 w-full text-orange" />
              </span>
            </h1>
            <p className="max-w-md text-lg text-muted">
              You take care of life — we&apos;ll take care of the rest. Market
              runs, groceries, pharmacy pickups, deliveries and anything in
              between.
            </p>

            {/* Intent input (visual for now) */}
            <form action="#get-started" className="flex max-w-md flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="What do you need run today?"
                aria-label="What do you need run today?"
                className="w-full rounded-full border border-cream-deep bg-white px-5 py-3.5 text-ink shadow-sm outline-none placeholder:text-muted focus:border-green-soft"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-green px-6 py-3.5 font-semibold text-cream transition hover:bg-green-deep"
              >
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </form>

            <div className="flex items-center gap-3 text-sm text-muted">
              <span className="flex text-orange">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" aria-hidden />
                ))}
              </span>
              Trusted for fast, reliable errands across the city.
            </div>
          </div>

          {/* Hero card */}
          <div className="relative">
            <div className="absolute -right-6 -top-6 hidden h-32 w-32 rounded-full bg-orange/15 md:block" />
            <div className="relative rounded-[2rem] bg-green p-7 text-cream shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-display text-xl font-semibold">
                  Errands by Mélange
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-xs font-semibold text-green-deep">
                  <span className="h-2 w-2 rounded-full bg-green-soft" />
                  Open
                </span>
              </div>
              <p className="mt-2 text-cream/80">
                I run it, so you don&apos;t have to.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {services.slice(0, 4).map((s) => (
                  <div
                    key={s.title}
                    className="flex items-center gap-3 rounded-2xl bg-cream/10 p-3"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-cream text-green">
                      <s.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="text-sm font-medium">{s.title}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between rounded-2xl bg-orange px-4 py-3 text-white">
                <span className="text-sm font-medium">Errand fee from</span>
                <span className="font-display text-2xl font-semibold">GHS 50</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-semibold uppercase tracking-wide text-orange">
              Services I offer
            </p>
            <h2 className="mt-2 font-display text-fluid-h2 font-semibold text-green-deep">
              Whatever the errand, consider it done
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <div
                key={s.title}
                className="group rounded-2xl border border-cream-deep bg-cream p-6 transition hover:-translate-y-1 hover:shadow-lg"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-green text-cream transition group-hover:bg-orange">
                  <s.icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-xl font-semibold text-green-deep">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm text-muted">{s.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-semibold uppercase tracking-wide text-orange">
              How it works
            </p>
            <h2 className="mt-2 font-display text-fluid-h2 font-semibold text-green-deep">
              Three steps to stress-free
            </h2>
          </div>
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <div key={s.title} className="flex flex-col">
                <div className="flex items-baseline justify-between border-t-2 border-cream-deep pt-4">
                  <span className="font-display text-5xl font-semibold text-orange">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-green/10 text-green">
                    <s.icon className="h-5 w-5" aria-hidden />
                  </span>
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-green-deep">
                  {s.title}
                </h3>
                <p className="mt-2 text-muted">{s.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section className="bg-green py-14 sm:py-20 text-cream">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-semibold uppercase tracking-wide text-orange">
              Why choose us
            </p>
            <h2 className="mt-2 font-display text-fluid-h2 font-semibold">
              Save time. Reduce stress. Let us handle it.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {trust.map((t) => (
              <div
                key={t.title}
                className="flex items-start gap-4 rounded-2xl bg-cream/10 p-6"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream text-green">
                  <t.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">{t.title}</h3>
                  <p className="text-sm text-cream/80">{t.blurb}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-2 md:items-center">
          <div>
            <p className="font-semibold uppercase tracking-wide text-orange">
              Charges &amp; fees
            </p>
            <h2 className="mt-2 font-display text-fluid-h2 font-semibold text-green-deep">
              Fair, transparent pricing
            </h2>
            <p className="mt-4 text-muted">
              Shopping costs are paid by the customer. Delivery fees are separate
              from service fees, and receipts are always provided on request.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Distance",
                "Waiting time",
                "Number of stops",
                "Complexity of errand",
              ].map((f) => (
                <li key={f} className="flex items-center gap-3 text-ink">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-green text-cream">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Sample errand receipt (transparency device) */}
          <div className="rounded-[2rem] border border-cream-deep bg-white p-7 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-semibold text-green-deep">
                  Sample errand
                </p>
                <p className="text-sm text-muted">Market run · Accra</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-3 py-1 text-xs font-semibold text-green-deep">
                <span className="h-2 w-2 rounded-full bg-green-soft" />
                Delivered
              </span>
            </div>

            <div className="my-5 border-t border-dashed border-cream-deep" />

            <dl className="space-y-2.5 text-sm">
              {[
                ["Groceries (paid at store)", "GHS 180.00"],
                ["Errand service fee", "GHS 50.00"],
                ["Delivery fee (3.2 km)", "GHS 22.00"],
              ].map(([label, amount]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium text-ink">{amount}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-cream-deep pt-3">
                <dt className="font-semibold text-green-deep">Total</dt>
                <dd className="font-display text-xl font-semibold text-green-deep">
                  GHS 252.00
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex items-center gap-2 rounded-2xl bg-cream p-3 text-sm text-green-deep">
              <Camera className="h-4 w-4 shrink-0 text-orange-deep" aria-hidden />
              Photo proof shared on delivery — no surprises.
            </div>

            <p className="mt-4 text-center font-display text-sm italic text-orange-deep">
              Receipts always provided on request →
            </p>

            <a
              href="#get-started"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange px-6 py-3.5 font-semibold text-white transition hover:bg-orange-deep"
            >
              Post an errand
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-semibold uppercase tracking-wide text-orange">
              Loved by busy people
            </p>
            <h2 className="mt-2 font-display text-fluid-h2 font-semibold text-green-deep">
              You relax — we run
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-cream p-6"
              >
                <span className="flex text-orange">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" aria-hidden />
                  ))}
                </span>
                <blockquote className="text-ink">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption className="mt-auto">
                  <p className="font-semibold text-green-deep">{t.name}</p>
                  <p className="text-sm text-muted">{t.tag}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Important notes / exceptions */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-5">
          <div className="rounded-[2rem] border border-cream-deep bg-white p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-green-deep">
              A few things we don&apos;t handle
            </h2>
            <p className="mt-2 text-muted">
              For everyone&apos;s safety, there are some errands we can&apos;t run.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {exceptions.map((e) => (
                <li key={e} className="flex items-start gap-3 text-ink">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange/15 text-orange-deep">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Get started / CTA band */}
      <section id="get-started" className="px-5 pb-14 sm:pb-20">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-green px-6 py-12 text-center text-cream shadow-xl sm:rounded-[2.5rem] sm:px-8 sm:py-14">
          <h2 className="mx-auto max-w-2xl font-display text-fluid-cta font-semibold">
            Save time. Reduce stress. Get more done.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/80">
            Tell us what you need and we&apos;ll run it. The Mélange app is
            launching soon — start an errand with us today.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={WHATSAPP}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-orange px-7 py-3.5 font-semibold text-white transition hover:bg-orange-deep"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              Chat on WhatsApp
            </a>
            <a
              href={PHONE}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-cream/40 px-7 py-3.5 font-semibold text-cream transition hover:bg-cream/10"
            >
              <Phone className="h-5 w-5" aria-hidden />
              055 764 4244
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-cream-deep bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p>Fast · Reliable · Trusted · Convenient</p>
          <p>© {new Date().getFullYear()} Errands by Mélange</p>
        </div>
      </footer>
    </div>
  );
}
