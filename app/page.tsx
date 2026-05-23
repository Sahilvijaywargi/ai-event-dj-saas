const features = [
  {
    title: "Adaptive Setlists",
    description:
      "Our DJ AI reads crowd energy and auto-curates seamless transitions in real time.",
  },
  {
    title: "Event Mood Engine",
    description:
      "Switch from cocktail lounge to peak-hour dance mode with one intelligent scene change.",
  },
  {
    title: "Voice + Prompt Control",
    description:
      "Direct your soundtrack with natural language: genres, vibe, bpm, and era prompts.",
  },
  {
    title: "Premium Audio Pipeline",
    description:
      "High-fidelity mastering and loudness balancing built for luxury venues and weddings.",
  },
  {
    title: "Instant Requests",
    description:
      "Guests scan a QR code and request tracks while your playlist remains on-brand.",
  },
  {
    title: "Auto Timeline Sync",
    description:
      "Align intros, first dance, speeches, and finale drops to your event schedule.",
  },
];

const pricing = [
  {
    plan: "Starter",
    price: "$49",
    cadence: "/event",
    description: "Perfect for private parties and smaller premium gatherings.",
    points: ["Up to 4 hours", "1 vibe profile", "Guest request portal"],
    highlight: false,
  },
  {
    plan: "Pro",
    price: "$149",
    cadence: "/month",
    description: "For event agencies that need consistency and wow-factor.",
    points: ["Unlimited events", "Advanced mood engine", "Timeline automation"],
    highlight: true,
  },
  {
    plan: "Signature",
    price: "Custom",
    cadence: "",
    description: "White-glove setup for luxury brands, venues, and weddings.",
    points: ["Dedicated onboarding", "Brand sound design", "Priority support"],
    highlight: false,
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-lux-gradient bg-[length:200%_200%] animate-gradient-shift opacity-90" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.24),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.08),transparent_32%),radial-gradient(circle_at_50%_80%,rgba(147,51,234,0.2),transparent_40%)]" />

      <div className="mx-auto max-w-6xl px-6 pb-20 pt-6 md:px-10">
        <nav className="glass-panel animate-fade-up sticky top-4 z-20 mb-14 flex items-center justify-between rounded-2xl px-5 py-4">
          <div className="text-sm font-semibold tracking-[0.28em] text-white md:text-base">
            AI EVENT DJ
          </div>
          <div className="hidden items-center gap-7 text-sm text-white/75 md:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#pricing" className="transition hover:text-white">
              Pricing
            </a>
            <a href="#cta" className="transition hover:text-white">
              Contact
            </a>
          </div>
            <a
              href="/login"
              className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold uppercase tracking-widest transition hover:border-white/50 hover:bg-white/10 md:text-sm"
            >
              Login
            </a>
        </nav>

        <section className="animate-fade-up text-center">
          <p className="mb-5 inline-block rounded-full border border-purple-300/30 bg-purple-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-purple-200">
            Luxury AI Sound Experience
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-tight md:text-6xl md:leading-[1.1]">
            Transform every celebration into a cinematic{" "}
            <span className="bg-gradient-to-r from-purple-300 via-white to-purple-400 bg-clip-text text-transparent">
              AI-powered DJ set
            </span>
            .
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-white/70 md:text-lg">
            AI EVENT DJ blends premium curation, crowd intelligence, and seamless
            transitions to deliver unforgettable music experiences for parties,
            weddings, and elite venues.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/signup"
              className="w-full rounded-full bg-white px-7 py-3 text-center text-sm font-semibold uppercase tracking-wider text-black transition hover:scale-[1.02] hover:bg-purple-100 sm:w-auto"
            >
              Start Free Trial
            </a>
            <button className="w-full rounded-full border border-white/30 px-7 py-3 text-sm font-semibold uppercase tracking-wider transition hover:border-white/60 hover:bg-white/10 sm:w-auto">
              Watch Product Tour
            </button>
          </div>
        </section>

        <section className="mt-16 grid gap-5 md:grid-cols-3">
          <div className="glass-panel animate-float rounded-2xl p-5 md:p-6">
            <p className="text-3xl font-semibold">10,000+</p>
            <p className="mt-1 text-sm text-white/65">Events enhanced globally</p>
          </div>
          <div className="glass-panel animate-float rounded-2xl p-5 [animation-delay:120ms] md:p-6">
            <p className="text-3xl font-semibold">4.9/5</p>
            <p className="mt-1 text-sm text-white/65">Average host satisfaction score</p>
          </div>
          <div className="glass-panel animate-float rounded-2xl p-5 [animation-delay:220ms] md:p-6">
            <p className="text-3xl font-semibold">35%</p>
            <p className="mt-1 text-sm text-white/65">Higher dance-floor retention</p>
          </div>
        </section>

        <section id="features" className="pt-24">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold md:text-4xl">Designed for premium events</h2>
            <p className="mx-auto mt-3 max-w-2xl text-white/65">
              Every feature is crafted to keep your music sophisticated, dynamic,
              and perfectly aligned with your event atmosphere.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="glass-panel rounded-2xl p-6 transition duration-300 hover:-translate-y-1 hover:border-purple-300/35"
              >
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="pt-24">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold md:text-4xl">Simple premium pricing</h2>
            <p className="mx-auto mt-3 max-w-2xl text-white/65">
              Start with one event or scale across your venue portfolio with
              flexible plans tailored for modern hosts.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {pricing.map((tier) => (
              <article
                key={tier.plan}
                className={`rounded-2xl border p-7 ${
                  tier.highlight
                    ? "border-purple-300/45 bg-purple-500/10 shadow-[0_0_60px_rgba(147,51,234,0.22)]"
                    : "glass-panel border-white/15"
                }`}
              >
                <p className="text-sm uppercase tracking-[0.22em] text-white/70">{tier.plan}</p>
                <p className="mt-5 text-4xl font-semibold">
                  {tier.price}
                  <span className="text-base font-normal text-white/60">{tier.cadence}</span>
                </p>
                <p className="mt-3 text-sm text-white/70">{tier.description}</p>
                <ul className="mt-6 space-y-2 text-sm text-white/85">
                  {tier.points.map((point) => (
                    <li key={point}>• {point}</li>
                  ))}
                </ul>
                <button
                  className={`mt-8 w-full rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-wider transition ${
                    tier.highlight
                      ? "bg-white text-black hover:bg-purple-100"
                      : "border border-white/30 hover:border-white/60 hover:bg-white/10"
                  }`}
                >
                  Choose {tier.plan}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section
          id="cta"
          className="mt-24 rounded-3xl border border-purple-300/25 bg-gradient-to-br from-purple-500/20 via-black/70 to-black/90 p-8 text-center shadow-[0_0_80px_rgba(168,85,247,0.18)] md:p-12"
        >
          <h2 className="text-3xl font-semibold md:text-4xl">
            Ready to host a next-level event?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">
            Launch AI EVENT DJ in minutes and orchestrate a luxury soundtrack
            your guests will remember long after the final track.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <button className="rounded-full bg-white px-8 py-3 text-sm font-semibold uppercase tracking-wider text-black transition hover:scale-[1.02] hover:bg-purple-100">
              Get Started
            </button>
            <button className="rounded-full border border-white/30 px-8 py-3 text-sm font-semibold uppercase tracking-wider transition hover:border-white/60 hover:bg-white/10">
              Schedule Concierge Setup
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}