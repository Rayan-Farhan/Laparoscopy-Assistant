import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileJson, FileSpreadsheet, FileText, Search } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/clinical/primitives";
import { apiDownloadReport, apiRequest } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { CasesListResponse, GeneratedReport, ReportsListResponse } from "@/lib/types";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — Laparoscopy Assistant" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const isBrowser = typeof window !== "undefined";
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "pdf" | "csv" | "json">("all");

  const casesQuery = useQuery({
    queryKey: ["reports", "cases"],
    queryFn: () => apiRequest<CasesListResponse>("/cases?page=1&page_size=100"),
    enabled: isBrowser,
  });

  const effectiveCaseId = selectedCaseId || casesQuery.data?.items[0]?.id || "";
  const selectedCase = casesQuery.data?.items.find((item) => item.id === effectiveCaseId);

  const reportsQuery = useQuery({
    queryKey: ["reports", effectiveCaseId],
    queryFn: () => apiRequest<ReportsListResponse>(`/cases/${effectiveCaseId}/reports?page=1&page_size=100`),
    enabled: isBrowser && Boolean(effectiveCaseId),
  });

  const filteredReports = useMemo(() => {
    const items = reportsQuery.data?.items ?? [];
    return items.filter((item) => {
      const matchesType = typeFilter === "all" ? true : item.report_type === typeFilter;
      const matchesSearch = searchTerm.trim()
        ? `${item.storage_key} ${item.report_type}`.toLowerCase().includes(searchTerm.trim().toLowerCase())
        : true;
      return matchesType && matchesSearch;
    });
  }, [reportsQuery.data?.items, searchTerm, typeFilter]);

  const typeCounts = useMemo(() => {
    const reports = reportsQuery.data?.items ?? [];
    return {
      all: reports.length,
      pdf: reports.filter((item) => item.report_type === "pdf").length,
      csv: reports.filter((item) => item.report_type === "csv").length,
      json: reports.filter((item) => item.report_type === "json").length,
    };
  }, [reportsQuery.data?.items]);

  const onDownload = async (reportId: string) => {
    try {
      await apiDownloadReport(reportId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report download failed.");
    }
  };

  const onBulkDownload = async () => {
    if (filteredReports.length === 0) {
      toast.error("No reports to download.");
      return;
    }
    try {
      for (const report of filteredReports) {
        await apiDownloadReport(report.id);
      }
      toast.success("Report downloads started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download all reports.");
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-1.5">
            Workspace · Reports
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Reports center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Exportable artifacts from completed processing jobs.
            {selectedCase ? ` Selected case: ${selectedCase.case_code}.` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBulkDownload}
            disabled={filteredReports.length === 0}
            className="h-9 px-3 border border-border-strong text-[11.5px] uppercase tracking-wider hover:bg-surface flex items-center gap-2 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" /> Bulk download
          </button>
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="flex items-center border-b border-border">
          {[
            { key: "all", label: "All", count: typeCounts.all },
            { key: "pdf", label: "PDF", count: typeCounts.pdf },
            { key: "csv", label: "CSV", count: typeCounts.csv },
            { key: "json", label: "JSON", count: typeCounts.json },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key as typeof typeFilter)}
              className={
                "h-10 px-4 text-[11.5px] uppercase tracking-[0.12em] border-r border-border whitespace-nowrap relative " +
                (typeFilter === tab.key
                  ? "text-foreground bg-surface"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface/50")
              }
            >
              {typeFilter === tab.key && <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-signal-cyan" />}
              {tab.label}
              <span className="ml-2 font-mono text-muted-foreground/70 normal-case">{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 h-12">
          <div className="flex items-center h-8 border border-border bg-surface px-2.5 gap-2 flex-1 max-w-md">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Filter by report filename or type…"
              className="bg-transparent flex-1 text-[12px] outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <select
            className="h-8 bg-surface border border-border px-2.5 text-[11.5px]"
            value={effectiveCaseId}
            onChange={(event) => setSelectedCaseId(event.target.value)}
            disabled={(casesQuery.data?.items.length ?? 0) === 0}
          >
            {(casesQuery.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.case_code}
              </option>
            ))}
          </select>
          <select className="h-8 bg-surface border border-border px-2.5 text-[11.5px]">
            <option>Latest</option>
          </select>
        </div>
      </div>

      <Panel dense>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border bg-surface/50">
              <th className="font-medium px-4 py-2.5">Case</th>
              <th className="font-medium py-2.5">Procedure</th>
              <th className="font-medium py-2.5">Type</th>
              <th className="font-medium py-2.5">Filename</th>
              <th className="font-medium py-2.5 text-right">Size</th>
              <th className="font-medium py-2.5">Generated</th>
              <th className="font-medium py-2.5 pr-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredReports.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                  No reports found for the selected filters.
                </td>
              </tr>
            )}
            {filteredReports.map((report) => (
              <ReportRow key={report.id} report={report} caseCode={selectedCase?.case_code ?? "—"} procedure={selectedCase?.procedure_type ?? "—"} onDownload={onDownload} />
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ReportRow({
  report,
  caseCode,
  procedure,
  onDownload,
}: {
  report: GeneratedReport;
  caseCode: string;
  procedure: string;
  onDownload: (reportId: string) => void;
}) {
  const Icon = report.report_type === "json" ? FileJson : report.report_type === "csv" ? FileSpreadsheet : FileText;
  const tint = report.report_type === "pdf" ? "text-signal-red" : report.report_type === "csv" ? "text-signal-green" : "text-signal-amber";
  const filename = report.storage_key.split("/").pop() ?? `report-${report.id}.${report.report_type}`;

  return (
    <tr className="border-b border-border/60 hover:bg-surface/40 group">
      <td className="px-4 py-2.5">
        <Link to="/cases/$caseId" params={{ caseId: report.case_id }} className="font-mono font-medium text-foreground group-hover:text-signal-cyan">
          {caseCode}
        </Link>
      </td>
      <td className="py-2.5 text-foreground/90">{procedure}</td>
      <td className="py-2.5">
        <span className="inline-flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${tint}`} strokeWidth={1.75} />
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">{report.report_type}</span>
        </span>
      </td>
      <td className="py-2.5 font-mono text-[11.5px] text-foreground/80">{filename}</td>
      <td className="py-2.5 text-right font-mono text-muted-foreground">{formatBytes(report.size_bytes)}</td>
      <td className="py-2.5 text-muted-foreground font-mono text-[11px]">{formatDateTime(report.created_at)}</td>
      <td className="py-2.5 pr-4 text-right">
        <button
          onClick={() => onDownload(report.id)}
          className="h-7 px-2.5 border border-border text-[10.5px] uppercase tracking-wider hover:bg-surface inline-flex items-center gap-1.5"
        >
          <Download className="h-3 w-3" /> Get
        </button>
      </td>
    </tr>
  );
}
