import { FormEvent, useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Panel, StatusPill } from "@/components/clinical/primitives";
import { apiRequest } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { CaseCreateRequest, CaseStatus, CasesListResponse, SurgeryCase } from "@/lib/types";

export const Route = createFileRoute("/cases")({
  head: () => ({ meta: [{ title: "Cases — Laparoscopy Assistant" }] }),
  component: CasesRouteComponent,
});

const STATUS_TABS: Array<{ key: "all" | CaseStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "uploaded", label: "Uploaded" },
  { key: "failed", label: "Failed" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

function CasesRouteComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/cases") {
    return <Outlet />;
  }
  return <CasesPage />;
}

function CasesPage() {
  const queryClient = useQueryClient();
  const isBrowser = typeof window !== "undefined";
  const [statusFilter, setStatusFilter] = useState<"all" | CaseStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const pageSize = 20;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (searchTerm.trim()) {
      params.set("query", searchTerm.trim());
    }
    return params.toString();
  }, [page, pageSize, searchTerm, statusFilter]);

  const casesQuery = useQuery({
    queryKey: ["cases", queryString],
    queryFn: () => apiRequest<CasesListResponse>(`/cases?${queryString}`),
    enabled: isBrowser,
  });

  const countsQuery = useQuery({
    queryKey: ["cases", "counts"],
    enabled: isBrowser,
    queryFn: async () => {
      const totals = await Promise.all(
        STATUS_TABS.map(async (tab) => {
          const params = new URLSearchParams();
          params.set("page", "1");
          params.set("page_size", "1");
          if (tab.key !== "all") {
            params.set("status", tab.key);
          }
          const response = await apiRequest<CasesListResponse>(`/cases?${params.toString()}`);
          return { key: tab.key, total: response.pagination.total };
        }),
      );
      return new Map(totals.map((item) => [item.key, item.total]));
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: (payload: CaseCreateRequest) =>
      apiRequest<SurgeryCase>("/cases", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Case created.");
      setShowCreateForm(false);
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Case creation failed.");
    },
  });

  const onCreateCase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createCaseMutation.mutate({
      case_code: String(form.get("case_code") ?? ""),
      procedure_type: String(form.get("procedure_type") ?? ""),
      surgery_date: String(form.get("surgery_date") ?? "") || undefined,
      notes: String(form.get("notes") ?? "") || undefined,
      de_identification_notes: String(form.get("de_identification_notes") ?? "") || undefined,
    });
  };

  const rows = casesQuery.data?.items ?? [];
  const total = casesQuery.data?.pagination.total ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, page - 1);
    const end = Math.min(maxPage, start + 2);
    const numbers: number[] = [];
    for (let i = start; i <= end; i += 1) {
      numbers.push(i);
    }
    return numbers;
  }, [maxPage, page]);

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-1.5">
            Workspace · Cases
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Surgical case registry</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, filter, and open recordings. {countsQuery.data?.get("all") ?? total} cases in this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 border border-border-strong text-[11.5px] uppercase tracking-wider hover:bg-surface">
            Import CSV
          </button>
          <button
            className="h-9 px-3 border border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan text-[11.5px] uppercase tracking-wider flex items-center gap-2 hover:bg-signal-cyan/20"
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
          >
            <Plus className="h-3.5 w-3.5" /> New case
          </button>
        </div>
      </div>

      {showCreateForm && (
        <Panel title="Create case" subtitle="POST /cases">
          <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={onCreateCase}>
            <input
              name="case_code"
              required
              placeholder="Case code (e.g. LAP-2451)"
              className="h-10 bg-surface border border-border px-3 text-[13px] text-foreground outline-none focus:border-signal-cyan"
            />
            <input
              name="procedure_type"
              required
              placeholder="Procedure type"
              className="h-10 bg-surface border border-border px-3 text-[13px] text-foreground outline-none focus:border-signal-cyan"
            />
            <input
              name="surgery_date"
              type="date"
              className="h-10 bg-surface border border-border px-3 text-[13px] text-foreground outline-none focus:border-signal-cyan"
            />
            <input
              name="de_identification_notes"
              placeholder="De-identification notes (optional)"
              className="h-10 bg-surface border border-border px-3 text-[13px] text-foreground outline-none focus:border-signal-cyan"
            />
            <input
              name="notes"
              placeholder="Notes (optional)"
              className="h-10 md:col-span-2 bg-surface border border-border px-3 text-[13px] text-foreground outline-none focus:border-signal-cyan"
            />
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="h-9 px-3 border border-border text-[11.5px] uppercase tracking-wider hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createCaseMutation.isPending}
                className="h-9 px-3 border border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan text-[11.5px] uppercase tracking-wider hover:bg-signal-cyan/20 disabled:opacity-60"
              >
                {createCaseMutation.isPending ? "Creating..." : "Create case"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <div className="border border-border bg-card">
        <div className="flex items-center border-b border-border overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const isActive = tab.key === statusFilter;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                className={
                  "h-10 px-4 text-[11.5px] uppercase tracking-[0.12em] border-r border-border whitespace-nowrap relative " +
                  (isActive
                    ? "text-foreground bg-surface"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface/50")
                }
              >
                {isActive && <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-signal-cyan" />}
                {tab.label}
                <span className="ml-2 font-mono text-muted-foreground/70 normal-case">{countsQuery.data?.get(tab.key) ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-4 h-12">
          <div className="flex items-center h-8 border border-border bg-surface px-2.5 gap-2 flex-1 max-w-md focus-within:border-signal-cyan/60">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search by case code or notes…"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
              className="bg-transparent flex-1 text-[12px] outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          <FilterChip label="Status" value={statusFilter === "all" ? "All" : statusFilter} />

          <div className="ml-auto flex items-center gap-2">
            <button className="h-8 px-2.5 border border-border text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-surface flex items-center gap-1.5">
              <SlidersHorizontal className="h-3 w-3" /> Columns
            </button>
            <span className="text-[11px] text-muted-foreground font-mono">
              <span className="text-foreground">{rows.length}</span> / {total}
            </span>
          </div>
        </div>
      </div>

      <Panel dense className="overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border bg-surface/50">
              <th className="font-medium px-4 py-2.5">Code</th>
              <th className="font-medium py-2.5">Procedure</th>
              <th className="font-medium py-2.5">Surgery date</th>
              <th className="font-medium py-2.5">Created by</th>
              <th className="font-medium py-2.5">Status</th>
              <th className="font-medium py-2.5 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  No cases found for the selected filters.
                </td>
              </tr>
            )}
            {rows.map((item) => (
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
                <td className="py-2.5 text-muted-foreground font-mono text-[11.5px]">{item.surgery_date ?? "—"}</td>
                <td className="py-2.5 text-muted-foreground font-mono text-[11.5px]">{item.created_by_user_id.slice(0, 8)}</td>
                <td className="py-2.5">
                  <StatusPill status={item.status} size="sm" />
                </td>
                <td className="py-2.5 pr-4 text-muted-foreground font-mono text-[11px]">{formatDate(item.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
        <div className="font-mono">
          Showing <span className="text-foreground">{pageStart === 0 ? 0 : `${pageStart}–${pageEnd}`}</span> of{" "}
          <span className="text-foreground">{total}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="h-8 w-8 border border-border flex items-center justify-center hover:bg-surface disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {pageNumbers.map((value) => (
            <button
              key={value}
              onClick={() => setPage(value)}
              className={
                "h-8 w-8 border text-[11.5px] font-mono " +
                (value === page
                  ? "border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan"
                  : "border-border text-muted-foreground hover:bg-surface hover:text-foreground")
              }
            >
              {value}
            </button>
          ))}
          <button
            className="h-8 w-8 border border-border flex items-center justify-center hover:bg-surface disabled:opacity-40"
            disabled={page >= maxPage}
            onClick={() => setPage((value) => Math.min(maxPage, value + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="h-8 px-2.5 border border-border text-[11px] flex items-center gap-2">
      <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
