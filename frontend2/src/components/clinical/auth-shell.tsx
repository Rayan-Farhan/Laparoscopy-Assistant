import { Link } from "@tanstack/react-router";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

export function AuthShell({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px] bg-background">
      {/* Left — clinical brand panel */}
      <aside className="hidden lg:flex relative bg-sidebar border-r border-border flex-col p-10">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 border border-signal-cyan flex items-center justify-center">
            <div className="h-1.5 w-1.5 bg-signal-cyan pulse-dot" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] font-semibold tracking-wide text-foreground">LAPAROSCOPY</span>
            <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">Assistant · v3.2</span>
          </div>
        </div>

        {/* Center artwork — abstract waveform */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-signal-cyan font-mono">
                Live signal · OR-3
              </div>
              <h1 className="text-3xl font-semibold leading-tight text-foreground">
                A precise workspace for<br />
                surgical video analytics.
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Tool detection, phase timelines, and exportable reports — produced by your own pipeline, audited by your own team.
              </p>
            </div>

            {/* Decorative timeline preview */}
            <div className="border border-border bg-card p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                <span>case LAP-2451 · 54:00</span>
                <span className="text-signal-green">●  succeeded</span>
              </div>
              <div className="space-y-1.5">
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
              <div className="flex justify-between text-[9.5px] text-muted-foreground/70 font-mono pt-1">
                <span>00:00</span><span>13:30</span><span>27:00</span><span>40:30</span><span>54:00</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono flex justify-between">
          <span>HIPAA · ISO 27001 · SOC 2 Type II</span>
          <span>© St. Stephen's Surgical Group</span>
        </div>
      </aside>

      {/* Right — form */}
      <main className="flex items-center justify-center px-6 py-12 lg:py-0">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 lg:hidden mb-8">
            <div className="h-5 w-5 border border-signal-cyan flex items-center justify-center">
              <div className="h-1.5 w-1.5 bg-signal-cyan" />
            </div>
            <span className="text-[12px] font-semibold tracking-wide">LAPAROSCOPY ASSISTANT</span>
          </div>

          <h2 className="text-2xl font-semibold text-foreground mb-1.5">{title}</h2>
          <p className="text-sm text-muted-foreground mb-8">{subtitle}</p>

          {children}

          {footer && (
            <div className="mt-8 pt-6 border-t border-border text-[12px] text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function Field({
  label, hint, children, required,
}: { label: string; hint?: ReactNode; children: ReactNode; required?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          {label}{required && <span className="text-signal-amber ml-1">*</span>}
        </span>
        {hint && <span className="text-[10.5px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full h-10 bg-surface border border-border px-3 text-[13px] text-foreground " +
        "placeholder:text-muted-foreground/50 outline-none focus:border-signal-cyan focus:ring-1 focus:ring-signal-cyan/30 " +
        "transition-colors " + (props.className ?? "")
      }
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "w-full h-10 bg-surface border border-border px-3 text-[13px] text-foreground " +
        "outline-none focus:border-signal-cyan focus:ring-1 focus:ring-signal-cyan/30 transition-colors " +
        (props.className ?? "")
      }
    />
  );
}

export function PrimaryButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={
        "w-full h-10 bg-signal-cyan text-primary-foreground font-medium text-[12.5px] " +
        "uppercase tracking-[0.14em] hover:brightness-110 transition-[filter] " +
        "border border-signal-cyan/60 " + (rest.className ?? "")
      }
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={
        "w-full h-10 bg-transparent text-foreground font-medium text-[12.5px] " +
        "uppercase tracking-[0.14em] hover:bg-surface transition-colors " +
        "border border-border-strong " + (rest.className ?? "")
      }
    >
      {children}
    </button>
  );
}

type AuthLinkTo = "/login" | "/signup" | "/forgot-password" | "/reset-password";

export function AuthLink({ to, children }: { to: AuthLinkTo; children: ReactNode }) {
  return (
    <Link to={to} className="text-signal-cyan hover:underline underline-offset-2">
      {children}
    </Link>
  );
}
