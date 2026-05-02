import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Laparoscopy Assistant — Surgical video intelligence" },
      {
        name: "description",
        content:
          "A clinical workspace for laparoscopic video review, tool detection, performance tracking, and exportable reports.",
      },
      { property: "og:title", content: "Laparoscopy Assistant" },
      {
        property: "og:description",
        content:
          "A clinical workspace for laparoscopic video review, tool detection, performance tracking, and exportable reports.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Capabilities />
        <ForWhom />
        <Workflow />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="h-14 border-b border-border flex items-center px-6 lg:px-10">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="h-5 w-5 border border-signal-cyan flex items-center justify-center">
          <div className="h-1.5 w-1.5 bg-signal-cyan" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[12px] font-semibold tracking-wide">LAPAROSCOPY</span>
          <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">Assistant</span>
        </div>
      </Link>

      <nav className="hidden md:flex items-center gap-7 ml-12 text-[12.5px] text-muted-foreground">
        <a href="#capabilities" className="hover:text-foreground">Capabilities</a>
        <a href="#for-whom" className="hover:text-foreground">Who it's for</a>
        <a href="#workflow" className="hover:text-foreground">How it works</a>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <Link
          to="/login"
          className="h-9 px-3.5 inline-flex items-center text-[12px] uppercase tracking-[0.14em] text-foreground hover:bg-surface border border-transparent hover:border-border"
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          className="h-9 px-3.5 inline-flex items-center text-[12px] uppercase tracking-[0.14em] bg-signal-cyan text-primary-foreground border border-signal-cyan/60 hover:brightness-110"
        >
          Request access
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="border-b border-border">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-20 lg:py-28 grid lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-7">
          <div className="text-[10.5px] uppercase tracking-[0.2em] text-signal-cyan font-mono mb-5">
            Surgical video intelligence
          </div>
          <h1 className="text-[44px] lg:text-[56px] leading-[1.05] font-semibold tracking-tight text-foreground">
            A quieter workspace for<br />
            laparoscopic video review.
          </h1>
          <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground max-w-xl">
            Upload a case, get a structured timeline of phases and instruments, compare a surgeon's performance against the team, and export the report. No noise, no dashboards full of vanity metrics.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              to="/signup"
              className="h-11 px-5 inline-flex items-center text-[12.5px] uppercase tracking-[0.14em] bg-signal-cyan text-primary-foreground border border-signal-cyan/60 hover:brightness-110"
            >
              Request access
            </Link>
            <Link
              to="/login"
              className="h-11 px-5 inline-flex items-center text-[12.5px] uppercase tracking-[0.14em] border border-border-strong text-foreground hover:bg-surface"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5 lg:pt-2">
          <div className="border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-mono">
              <span>Case LAP-2451 · 54:00</span>
              <span className="text-signal-green">Succeeded</span>
            </div>
            <div className="space-y-1.5 pt-2">
              {[
                { c: "var(--color-tool-grasper)",  segs: [[5, 22], [40, 18], [70, 8]] },
                { c: "var(--color-tool-hook)",     segs: [[12, 30], [55, 16]] },
                { c: "var(--color-tool-clipper)",  segs: [[34, 6], [62, 5]] },
                { c: "var(--color-tool-scissors)", segs: [[28, 9], [80, 11]] },
                { c: "var(--color-tool-bipolar)",  segs: [[48, 14]] },
              ].map((row, i) => (
                <div key={i} className="relative h-2 bg-surface-2">
                  {row.segs.map((s, j) => (
                    <span
                      key={j}
                      className="absolute top-0 bottom-0"
                      style={{ left: `${s[0]}%`, width: `${s[1]}%`, background: row.c }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9.5px] text-muted-foreground/70 font-mono pt-2">
              <span>00:00</span><span>13:30</span><span>27:00</span><span>40:30</span><span>54:00</span>
            </div>
            <div className="pt-3 border-t border-border grid grid-cols-3 gap-4 text-[11px]">
              <Metric label="Phases" value="7" />
              <Metric label="Tools" value="5" />
              <Metric label="Idle time" value="6:12" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="text-foreground font-mono text-[15px] mt-0.5">{value}</div>
    </div>
  );
}

function Capabilities() {
  const items = [
    {
      k: "Tool detection",
      d: "A trained pipeline identifies instruments frame-by-frame and produces a complete usage timeline per case.",
    },
    {
      k: "Phase segmentation",
      d: "Procedures are broken down into recognisable surgical phases so cases can be compared like-for-like.",
    },
    {
      k: "Performance tracking",
      d: "Surgeons see their own metrics — duration, tool dwell time, idle periods — versus the team's median.",
    },
    {
      k: "Junior assistance",
      d: "Trainees can review their own footage against reference cases and receive structured, objective feedback.",
    },
    {
      k: "Workflow improvement",
      d: "Departments identify bottlenecks across rooms, shifts and procedure types — without guessing.",
    },
    {
      k: "Exportable reports",
      d: "Every case produces a JSON, CSV and PDF artifact suitable for archives, M&M reviews, or research.",
    },
  ];
  return (
    <section id="capabilities" className="border-b border-border">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-20">
        <SectionHeading eyebrow="Capabilities" title="Built around the things surgeons actually review." />
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 border-t border-l border-border">
          {items.map((it) => (
            <div key={it.k} className="border-r border-b border-border p-6">
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-signal-cyan font-mono">
                {it.k}
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                {it.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForWhom() {
  const groups = [
    {
      h: "Attending surgeons",
      p: "Track your own case mix and durations, compare against the department, and keep an indexable archive of your work.",
    },
    {
      h: "Junior surgeons & residents",
      p: "Review your footage against senior reference cases, see where time was spent, and get objective signal — not just verbal notes.",
    },
    {
      h: "Department leads",
      p: "Understand throughput, identify outlier cases, and make staffing and OR-allocation decisions with case-level evidence.",
    },
  ];
  return (
    <section id="for-whom" className="border-b border-border">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-20">
        <SectionHeading eyebrow="Who it's for" title="One workspace, three jobs." />
        <div className="mt-10 grid md:grid-cols-3 gap-px bg-border border border-border">
          {groups.map((g) => (
            <div key={g.h} className="bg-background p-7">
              <h3 className="text-[15px] font-semibold text-foreground">{g.h}</h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">{g.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  const steps = [
    { n: "01", h: "Upload the case", d: "Drag a video file into the case workspace. Metadata such as procedure, surgeon and recording time are captured up-front." },
    { n: "02", h: "Automated analysis", d: "The pipeline produces phase segments and an instrument-usage timeline, viewable alongside the video." },
    { n: "03", h: "Review & compare", d: "Scrub the timeline, jump between phases, and compare the case against the surgeon's own history or the team baseline." },
    { n: "04", h: "Export the report", d: "Download a PDF for records, or JSON / CSV for downstream research and audit pipelines." },
  ];
  return (
    <section id="workflow" className="border-b border-border">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-20">
        <SectionHeading eyebrow="How it works" title="Four steps from raw video to a structured case." />
        <ol className="mt-12 grid md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li
              key={s.n}
              className={
                "p-6 border-t border-border " +
                (i > 0 ? "lg:border-l " : "lg:border-l ") +
                (i === 0 ? "lg:border-l " : "")
              }
            >
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-signal-cyan font-mono">{s.n}</div>
              <div className="mt-3 text-[14.5px] font-semibold text-foreground">{s.h}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="border-b border-border">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
        <div>
          <h2 className="text-[28px] font-semibold tracking-tight text-foreground max-w-xl">
            Bring the same rigor to video that you bring to outcomes.
          </h2>
          <p className="mt-3 text-[14px] text-muted-foreground max-w-xl">
            Access is granted per organisation. We'll set you up with a workspace and walk through onboarding with your team.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/signup"
            className="h-11 px-5 inline-flex items-center text-[12.5px] uppercase tracking-[0.14em] bg-signal-cyan text-primary-foreground border border-signal-cyan/60 hover:brightness-110"
          >
            Request access
          </Link>
          <Link
            to="/login"
            className="h-11 px-5 inline-flex items-center text-[12.5px] uppercase tracking-[0.14em] border border-border-strong text-foreground hover:bg-surface"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="px-6 lg:px-10 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-[12px] text-muted-foreground">
      <div>© Laparoscopy Assistant. All rights reserved.</div>
      <div className="flex items-center gap-5">
        <a href="#" className="hover:text-foreground">Privacy</a>
        <a href="#" className="hover:text-foreground">Terms</a>
        <a href="#" className="hover:text-foreground">Contact</a>
      </div>
    </footer>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-signal-cyan font-mono mb-4">
        {eyebrow}
      </div>
      <h2 className="text-[30px] lg:text-[36px] leading-[1.1] font-semibold tracking-tight text-foreground">
        {title}
      </h2>
    </div>
  );
}