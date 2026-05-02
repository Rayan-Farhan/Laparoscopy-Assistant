import { useMemo, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Plus } from "lucide-react";

import { KV, Panel, Sparkline, Stat, StatusPill } from "@/components/clinical/primitives";
import { apiRequest } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { CasesListResponse, Organization, ProcessingJob, SurgeryCase } from "@/lib/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Overview — Laparoscopy Assistant" }] }),
  component: Dashboard,
});

function Dashboard() {
  const isBrowser = typeof window !== "undefined";
  const casesQuery = useQuery({
    queryKey: ["dashboard", "cases"],
    queryFn: () => apiRequest<CasesListResponse>("/cases?page=1&page_size=100"),
    enabled: isBrowser,
  });

  const organizationQuery = useQuery({
    queryKey: ["dashboard", "organization"],
    queryFn: () => apiRequest<Organization>("/organizations/current"),
    enabled: isBrowser,
  });

  const cases = casesQuery.data?.items ?? [];
  const totalCases = cases.length;
  const completedCases = cases.filter((item) => item.status === "completed").length;
  const processingCases = cases.filter((item) => item.status === "processing");
  const failedCases = cases.filter((item) => item.status === "failed");
  const successRateValue = totalCases > 0 ? ((completedCases / totalCases) * 100).toFixed(1) : "0.0";
  const recent = cases.slice(0, 8);

  const processingCaseIds = useMemo(() => processingCases.slice(0, 5).map((item) => item.id), [processingCases]);
  const activeJobsQuery = useQuery({
    queryKey: ["dashboard", "active-jobs", ...processingCaseIds],
    enabled: isBrowser && processingCaseIds.length > 0,
    refetchInterval: 3000,
    queryFn: async () => {
      const jobsByCase = await Promise.all(
        processingCaseIds.map(async (caseId) => {
          const jobs = await apiRequest<ProcessingJob[]>(`/cases/${caseId}/jobs`);
          const active = jobs.find((job) => job.status === "running" || job.status === "queued") ?? jobs[0] ?? null;
          return { caseId, job: active };
        }),
      );
      return jobsByCase;
    },
  });

  const activeJobs = useMemo(() => {
    const caseMap = new Map(cases.map((item) => [item.id, item]));
    return (activeJobsQuery.data ?? [])
      .map((entry) => ({
        caseItem: caseMap.get(entry.caseId),
        job: entry.job,
      }))
      .filter((entry): entry is { caseItem: SurgeryCase; job: ProcessingJob | null } => Boolean(entry.caseItem));
  }, [activeJobsQuery.data, cases]);

  const throughputData = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const values = Array.from({ length: 30 }, () => 0);
    cases.forEach((item) => {
      const created = new Date(item.created_at);
      if (Number.isNaN(created.getTime())) return;
      created.setUTCHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - created.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays < 0 || diffDays >= 30) return;
      const index = 29 - diffDays;
      values[index] = (values[index] ?? 0) + 1;
    });
    return values;
  }, [cases]);

  const successRateSeries = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const buckets = Array.from({ length: 20 }, () => ({ total: 0, completed: 0 }));
    cases.forEach((item) => {
      const created = new Date(item.created_at);
      if (Number.isNaN(created.getTime())) return;
      created.setUTCHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - created.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays < 0 || diffDays >= 20) return;
      const index = 19 - diffDays;
      const bucket = buckets[index];
      if (!bucket) return;
      bucket.total += 1;
      if (item.status === "completed") {
        bucket.completed += 1;
      }
    });
    return buckets.map((bucket) => (bucket.total === 0 ? 0 : Math.round((bucket.completed / bucket.total) * 100)));
  }, [cases]);

  const failedLast7d = useMemo(() => {
    const now = new Date().getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return failedCases.filter((item) => {
      const created = new Date(item.created_at).getTime();
      return Number.isFinite(created) && now - created <= sevenDaysMs;
    }).length;
  }, [failedCases]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-1.5">
            Workspace · Overview
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Operating room intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Last 30 days · {organizationQuery.data?.name ?? "Your organization"} · {totalCases} cases
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 border border-border-strong text-[11.5px] uppercase tracking-wider hover:bg-surface">
            Export period
          </button>
          <Link
            to="/cases"
            className="h-9 px-3 border border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan text-[11.5px] uppercase tracking-wider flex items-center gap-2 hover:bg-signal-cyan/20"
          >
            <Plus className="h-3.5 w-3.5" /> New case
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 border border-border bg-card divide-x divide-border">
        <KpiCell>
          <Stat label="Total cases" value={totalCases} hint="Across all surgeons" />
          <Sparkline data={throughputData} accent="cyan" />
        </KpiCell>
        <KpiCell>
          <Stat label="Processing" value={processingCases.length} unit="active" accent="amber" hint="Currently running" />
          <div className="flex items-center gap-1.5 text-[10.5px] text-signal-amber font-mono uppercase tracking-wider">
            <span className="h-1.5 w-1.5 bg-signal-amber pulse-dot rounded-full" /> running
          </div>
        </KpiCell>
        <KpiCell>
          <Stat label="Success rate" value={successRateValue} unit="%" accent="green" hint="Completed cases ratio" />
          <Sparkline data={successRateSeries} accent="green" />
        </KpiCell>
        <KpiCell>
          <Stat label="Median duration" value="—" unit="min" hint="Available after timeline ingestion" />
        </KpiCell>
        <KpiCell>
          <Stat label="Failed (7d)" value={failedLast7d} accent="red" hint="Review in cases" />
        </KpiCell>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <Panel
          title="Cases processed · 30 days"
          subtitle="Daily count"
          className="col-span-12 lg:col-span-8"
          action={
            <div className="flex items-center gap-1 text-[10.5px] font-mono">
              {["7D", "30D", "90D", "ALL"].map((period, i) => (
                <button
                  key={period}
                  className={`px-2 h-6 border ${i === 1 ? "border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {period}
                </button>
              ))}
            </div>
          }
        >
          <ThroughputChart data={throughputData} />
        </Panel>

        <Panel
          title="Active jobs"
          subtitle={`${processingCases.length} running`}
          className="col-span-12 lg:col-span-4"
          action={
            <Link to="/cases" className="text-[10.5px] uppercase tracking-wider text-signal-cyan hover:underline">
              All →
            </Link>
          }
          dense
        >
          <ul className="divide-y divide-border">
            {activeJobs.length === 0 && (
              <li className="p-3 text-[12px] text-muted-foreground">No active processing jobs.</li>
            )}
            {activeJobs.slice(0, 3).map((entry) => {
              const progress = entry.job?.progress_percent ?? 0;
              return (
                <li key={entry.caseItem.id} className="p-3 hover:bg-surface/50">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: entry.caseItem.id }}
                      className="text-[12.5px] font-medium text-foreground hover:text-signal-cyan"
                    >
                      {entry.caseItem.case_code}
                    </Link>
                    <StatusPill status={entry.job?.status ?? "processing"} size="sm" />
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-2 truncate">{entry.caseItem.procedure_type}</div>
                  <ProgressBar value={progress} />
                  <div className="flex justify-between text-[10px] text-muted-foreground/80 font-mono mt-1.5">
                    <span>{entry.job?.model_version ?? "best.pt"}</span>
                    <span>{progress}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel
          title="Recent cases"
          subtitle={`${recent.length} of ${totalCases}`}
          className="col-span-12 lg:col-span-8"
          action={
            <Link
              to="/cases"
              className="text-[10.5px] uppercase tracking-wider text-signal-cyan hover:underline flex items-center gap-1"
            >
              Open cases <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
          dense
        >
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border">
                <th className="font-medium px-4 py-2.5">Code</th>
                <th className="font-medium py-2.5">Procedure</th>
                <th className="font-medium py-2.5">Date</th>
                <th className="font-medium py-2.5 text-right">Duration</th>
                <th className="font-medium py-2.5">Status</th>
                <th className="font-medium py-2.5 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.id} className="border-b border-border/60 hover:bg-surface/40 group">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: item.id }}
                      className="font-mono font-medium text-foreground group-hover:text-signal-cyan"
                    >
                      {item.case_code}
                    </Link>
                  </td>
                  <td className="py-2.5 text-foreground/90">{item.procedure_type}</td>
                  <td className="py-2.5 text-muted-foreground">{item.surgery_date ?? "—"}</td>
                  <td className="py-2.5 text-right font-mono text-foreground/80">—</td>
                  <td className="py-2.5">
                    <StatusPill status={item.status} size="sm" />
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground font-mono text-[11px]">{formatDate(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Panel title="Tool utilization" subtitle="Last 30 days">
            <div className="space-y-2">
              <KV label="Grasper">From case timelines</KV>
              <KV label="Hook electrocautery">Use case detail for per-case breakdown</KV>
              <KV label="Clipper">Generated after successful processing</KV>
              <KV label="Scissors">Generated after successful processing</KV>
              <KV label="Bipolar">Generated after successful processing</KV>
              <KV label="Irrigator">Generated after successful processing</KV>
            </div>
          </Panel>

          <Panel title="Surgeon performance" subtitle="Median duration vs. peer group">
            <div className="space-y-2">
              <KV label="Status">Calculated from processed timelines</KV>
              <KV label="Current scope">Available in case-level detail pages</KV>
              <KV label="Tip">Use reports exports for analytics pipelines</KV>
            </div>
          </Panel>

          <Panel title="Notifications" subtitle="Last 24h">
            <ul className="space-y-3">
              <Alert level="info" title="Backend connected" detail="Live data loaded from /api/v1 endpoints." ts="now" />
              <Alert
                level="warn"
                title="Duration KPI pending"
                detail="Requires timeline aggregation across completed cases."
                ts="now"
              />
              <Alert level="info" title="Reports ready in case detail" detail="Download JSON/CSV/PDF artifacts per case." ts="now" />
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function KpiCell({ children }: { children: ReactNode }) {
  return <div className="p-4 flex flex-col justify-between gap-3 min-h-[112px]">{children}</div>;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 bg-surface-2 overflow-hidden">
      <div className="h-full bg-signal-amber transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function Alert({
  level,
  title,
  detail,
  ts,
}: {
  level: "info" | "warn" | "err";
  title: string;
  detail: string;
  ts: string;
}) {
  const color =
    level === "err"
      ? "text-signal-red border-signal-red/40 bg-signal-red/5"
      : level === "warn"
        ? "text-signal-amber border-signal-amber/40 bg-signal-amber/5"
        : "text-signal-cyan border-signal-cyan/40 bg-signal-cyan/5";
  return (
    <li className={`border-l-2 pl-3 py-1 ${color}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">{ts}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{detail}</div>
    </li>
  );
}

function ThroughputChart({ data }: { data: number[] }) {
  const w = 720;
  const h = 200;
  const pad = 24;
  const values = data.length > 0 ? data : [0];
  const max = Math.max(...values, 1) * 1.15;
  const bw = (w - pad * 2) / values.length;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[200px]">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line
              x1={pad}
              x2={w - pad}
              y1={h - pad - (h - pad * 2) * p}
              y2={h - pad - (h - pad * 2) * p}
              stroke="var(--color-border)"
              strokeDasharray="2 3"
            />
            <text
              x={pad - 6}
              y={h - pad - (h - pad * 2) * p + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-muted-foreground)"
              fontFamily="JetBrains Mono"
            >
              {Math.round(max * p)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const bh = ((h - pad * 2) * v) / max;
          return (
            <g key={i}>
              <rect
                x={pad + i * bw + 1}
                y={h - pad - bh}
                width={bw - 2}
                height={bh}
                fill="var(--color-signal-cyan)"
                opacity={i === values.length - 1 ? 1 : 0.32}
              />
            </g>
          );
        })}
        {[0, 7, 14, 21, 29].map((i) => (
          <text
            key={i}
            x={pad + i * bw + bw / 2}
            y={h - 6}
            textAnchor="middle"
            fontSize={9}
            fill="var(--color-muted-foreground)"
            fontFamily="JetBrains Mono"
          >
            d-{29 - i}
          </text>
        ))}
      </svg>
    </div>
  );
}
