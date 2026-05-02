import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CaseStatus, JobStatus } from "@/lib/types";

/* ---------- Panel ---------- */
export function Panel({
  title, subtitle, action, children, className, dense, mono,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
  mono?: boolean;
}) {
  return (
    <section className={cn("border border-border bg-card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-border px-4 h-10">
          <div className="flex items-baseline gap-3 min-w-0">
            {title && (
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {title}
              </h3>
            )}
            {subtitle && (
              <span className="text-[11px] text-muted-foreground/70 truncate" data-mono={mono ? true : undefined}>
                {subtitle}
              </span>
            )}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(dense ? "p-0" : "p-4")}>{children}</div>
    </section>
  );
}

/* ---------- Status Pill ---------- */
type StatusValue = CaseStatus | JobStatus;

const STATUS_MAP: Record<StatusValue, { label: string; dot: string; text: string; bg: string; border: string; pulse?: boolean }> = {
  draft:      { label: "Draft",      dot: "bg-muted-foreground",     text: "text-muted-foreground", bg: "bg-muted/40",       border: "border-border" },
  uploaded:   { label: "Uploaded",   dot: "bg-signal-cyan",          text: "text-signal-cyan",       bg: "bg-signal-cyan/10",   border: "border-signal-cyan/30" },
  processing: { label: "Processing", dot: "bg-signal-amber",         text: "text-signal-amber",      bg: "bg-signal-amber/10",  border: "border-signal-amber/30", pulse: true },
  completed:  { label: "Completed",  dot: "bg-signal-green",         text: "text-signal-green",      bg: "bg-signal-green/10",  border: "border-signal-green/30" },
  succeeded:  { label: "Succeeded",  dot: "bg-signal-green",         text: "text-signal-green",      bg: "bg-signal-green/10",  border: "border-signal-green/30" },
  failed:     { label: "Failed",     dot: "bg-signal-red",           text: "text-signal-red",        bg: "bg-signal-red/10",    border: "border-signal-red/30" },
  archived:   { label: "Archived",   dot: "bg-muted-foreground/60",  text: "text-muted-foreground",  bg: "bg-muted/40",         border: "border-border" },
  queued:     { label: "Queued",     dot: "bg-muted-foreground",     text: "text-muted-foreground",  bg: "bg-muted/40",         border: "border-border" },
  running:    { label: "Running",    dot: "bg-signal-amber",         text: "text-signal-amber",      bg: "bg-signal-amber/10",  border: "border-signal-amber/30", pulse: true },
};

export function StatusPill({ status, size = "md" }: { status: keyof typeof STATUS_MAP; size?: "sm" | "md" }) {
  const s = STATUS_MAP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border rounded-sm font-medium uppercase tracking-wider",
        s.text, s.bg, s.border,
        size === "sm" ? "px-1.5 h-5 text-[10px]" : "px-2 h-6 text-[10.5px]"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, s.pulse && "pulse-dot")} />
      {s.label}
    </span>
  );
}

/* ---------- Stat ---------- */
export function Stat({
  label, value, unit, delta, hint, accent,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { v: string; positive?: boolean };
  hint?: string;
  accent?: "cyan" | "amber" | "green" | "red";
}) {
  const accentColor =
    accent === "amber" ? "text-signal-amber" :
    accent === "green" ? "text-signal-green" :
    accent === "red"   ? "text-signal-red" :
    accent === "cyan"  ? "text-signal-cyan" : "text-foreground";
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium truncate">
          {label}
        </span>
        {delta && (
          <span
            className={cn(
              "text-[10.5px] font-medium tabular-nums",
              delta.positive === false ? "text-signal-red" : "text-signal-green"
            )}
            data-mono
          >
            {delta.v}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-3xl font-semibold tabular-nums leading-none", accentColor)} data-mono>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
    </div>
  );
}

/* ---------- Sparkline ---------- */
export function Sparkline({ data, height = 28, accent = "cyan" }: { data: number[]; height?: number; accent?: "cyan" | "amber" | "green" }) {
  const w = 120;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const path = data
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(height - ((v - min) / range) * (height - 2) - 1).toFixed(1)}`)
    .join(" ");
  const stroke =
    accent === "amber" ? "var(--color-signal-amber)" :
    accent === "green" ? "var(--color-signal-green)" : "var(--color-signal-cyan)";
  return (
    <svg width={w} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} />
      <circle
        cx={(data.length - 1) * step}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 2) - 1}
        r={2}
        fill={stroke}
      />
    </svg>
  );
}

/* ---------- Kbd ---------- */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 border border-border-strong bg-surface-2 text-[10px] text-muted-foreground rounded-sm">
      {children}
    </kbd>
  );
}

/* ---------- KV row ---------- */
export function KV({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("text-[12.5px] text-foreground", mono && "font-mono tabular-nums")}>{children}</span>
    </div>
  );
}
