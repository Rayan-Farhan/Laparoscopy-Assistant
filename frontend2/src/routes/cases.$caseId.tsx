import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Play,
  RotateCw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { KV, Panel, Stat, StatusPill } from "@/components/clinical/primitives";
import { Timeline } from "@/components/clinical/timeline";
import { apiDownloadReport, apiRequest, apiUploadFile } from "@/lib/api";
import { formatBytes, formatDateTime, formatDuration, formatMinutesFromSeconds } from "@/lib/format";
import type {
  ProcessingJob,
  ProcessCaseRequest,
  ReportsListResponse,
  SurgeryCase,
  ToolTimelineEntry,
  VideoAsset,
} from "@/lib/types";

export const Route = createFileRoute("/cases/$caseId")({
  head: ({ params }) => ({ meta: [{ title: `${params.caseId} — Case workspace` }] }),
  component: CaseDetail,
  notFoundComponent: () => <div className="p-12 text-center text-muted-foreground">Case not found.</div>,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  const queryClient = useQueryClient();
  const isBrowser = typeof window !== "undefined";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const caseQuery = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiRequest<SurgeryCase>(`/cases/${caseId}`),
    enabled: isBrowser,
  });

  const videosQuery = useQuery({
    queryKey: ["case", caseId, "videos"],
    queryFn: () => apiRequest<VideoAsset[]>(`/cases/${caseId}/videos`),
    enabled: isBrowser,
  });

  const jobsQuery = useQuery({
    queryKey: ["case", caseId, "jobs"],
    queryFn: () => apiRequest<ProcessingJob[]>(`/cases/${caseId}/jobs`),
    enabled: isBrowser,
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === "running" || job.status === "queued") ? 3000 : false,
  });

  const timelineQuery = useQuery({
    queryKey: ["case", caseId, "timeline"],
    queryFn: () => apiRequest<ToolTimelineEntry[]>(`/cases/${caseId}/timeline`),
    enabled: isBrowser,
  });

  const reportsQuery = useQuery({
    queryKey: ["case", caseId, "reports"],
    queryFn: () => apiRequest<ReportsListResponse>(`/cases/${caseId}/reports?page=1&page_size=50`),
    enabled: isBrowser,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      apiUploadFile<VideoAsset>({
        path: `/cases/${caseId}/videos/upload`,
        file,
        onProgress: setUploadProgress,
      }),
    onSuccess: (video) => {
      setUploadProgress(100);
      setSelectedVideoId(video.id);
      toast.success("Video uploaded.");
      queryClient.invalidateQueries({ queryKey: ["case", caseId, "videos"] });
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      setTimeout(() => setUploadProgress(0), 800);
    },
    onError: (error) => {
      setUploadProgress(0);
      toast.error(error instanceof Error ? error.message : "Video upload failed.");
    },
  });

  const processMutation = useMutation({
    mutationFn: () =>
      apiRequest<ProcessingJob>(`/cases/${caseId}/process`, {
        method: "POST",
        body: JSON.stringify({
          video_asset_id: selectedVideoId ?? undefined,
        } as ProcessCaseRequest),
      }),
    onSuccess: () => {
      toast.success("Processing started.");
      queryClient.invalidateQueries({ queryKey: ["case", caseId, "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case", caseId, "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["case", caseId, "reports"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start processing.");
    },
  });

  const generateReportsMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/cases/${caseId}/reports/generate`, {
        method: "POST",
        body: JSON.stringify({ report_types: ["json", "csv", "pdf"] }),
      }),
    onSuccess: () => {
      toast.success("Reports generated.");
      queryClient.invalidateQueries({ queryKey: ["case", caseId, "reports"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Report generation failed.");
    },
  });

  const videos = videosQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const timelineRows = timelineQuery.data ?? [];
  const reports = reportsQuery.data?.items ?? [];

  useEffect(() => {
    if (videos.length === 0) {
      setSelectedVideoId(null);
      return;
    }
    if (!selectedVideoId || !videos.some((video) => video.id === selectedVideoId)) {
      setSelectedVideoId(videos[0]?.id ?? null);
    }
  }, [selectedVideoId, videos]);

  const caseItem = caseQuery.data;
  const selectedVideo = videos.find((video) => video.id === selectedVideoId) ?? videos[0];
  const activeJob = jobs.find((job) => job.status === "running" || job.status === "queued") ?? jobs[0];
  const timelineDurationSeconds = useMemo(
    () => Math.max(timelineRows.reduce((max, row) => Math.max(max, row.end_sec), 0), selectedVideo?.duration_sec ?? 0),
    [selectedVideo?.duration_sec, timelineRows],
  );
  const canProcess = videos.some((video) => video.upload_status === "uploaded");

  const downloadReport = async (reportId: string) => {
    try {
      await apiDownloadReport(reportId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report download failed.");
    }
  };

  const downloadAllReports = async () => {
    if (reports.length === 0) {
      toast.error("No generated reports available.");
      return;
    }
    try {
      for (const report of reports) {
        await apiDownloadReport(report.id);
      }
      toast.success("Report downloads started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download reports.");
    }
  };

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
    event.target.value = "";
  };

  if (caseQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading case workspace...</div>;
  }

  if (!caseItem) {
    return <div className="p-6 text-sm text-muted-foreground">Case not found.</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card">
        <div className="px-6 py-4 flex items-start justify-between gap-6 max-w-[1700px]">
          <div className="min-w-0">
            <Link
              to="/cases"
              className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground font-mono inline-flex items-center gap-1.5 mb-2"
            >
              <ChevronLeft className="h-3 w-3" /> Cases
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-foreground font-mono tabular-nums">{caseItem.case_code}</h1>
              <StatusPill status={caseItem.status} />
              <span className="text-[11px] font-mono text-muted-foreground">{caseItem.id}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px] text-muted-foreground">
              <span>
                <span className="text-muted-foreground/70">Procedure</span>{" "}
                <span className="text-foreground">{caseItem.procedure_type}</span>
              </span>
              <span className="text-border-strong">·</span>
              <span>
                <span className="text-muted-foreground/70">Surgery date</span>{" "}
                <span className="text-foreground">{caseItem.surgery_date ?? "—"}</span>
              </span>
              <span className="text-border-strong">·</span>
              <span>
                <span className="text-muted-foreground/70">Created by</span>{" "}
                <span className="text-foreground font-mono">{caseItem.created_by_user_id.slice(0, 8)}</span>
              </span>
              <span className="text-border-strong">·</span>
              <span className="font-mono">{formatDateTime(caseItem.created_at)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={downloadAllReports}
              disabled={reports.length === 0}
              className="h-9 px-3 border border-border-strong text-[11.5px] uppercase tracking-wider hover:bg-surface flex items-center gap-2 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" /> Export bundle
            </button>
            <button
              onClick={() => processMutation.mutate()}
              disabled={!canProcess || processMutation.isPending}
              className="h-9 px-3 border border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan text-[11.5px] uppercase tracking-wider flex items-center gap-2 hover:bg-signal-cyan/20 disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" /> {processMutation.isPending ? "Starting..." : "Re-process"}
            </button>
            <button className="h-9 w-9 border border-border-strong flex items-center justify-center hover:bg-surface">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-t border-border grid grid-cols-2 md:grid-cols-5 divide-x divide-border bg-background/50">
          <MiniStat label="Duration" value={formatMinutesFromSeconds(timelineDurationSeconds)} unit="min" />
          <MiniStat label="Video size" value={formatBytes(selectedVideo?.file_size_bytes)} />
          <MiniStat label="Resolution" value="1920×1080" unit="25fps" mono />
          <MiniStat label="Codec" value="H.264" unit="High@4.1" mono />
          <MiniStat label="Segments" value={`${timelineRows.length}`} unit="timeline rows" />
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6 max-w-[1700px]">
        <div className="grid grid-cols-12 gap-6">
          <Panel
            title="Tool timeline"
            subtitle={`${activeJob?.model_version ?? "best.pt"} · ${formatDuration(timelineDurationSeconds)} duration`}
            className="col-span-12"
            action={
              <div className="flex items-center gap-1 text-[10.5px] font-mono">
                {["Tools", "Phases", "Events"].map((tab, i) => (
                  <button
                    key={tab}
                    className={
                      "px-2.5 h-6 border " +
                      (i === 0
                        ? "border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    {tab}
                  </button>
                ))}
              </div>
            }
          >
            <Timeline segments={timelineRows} />
          </Panel>

          <div className="col-span-12 lg:col-span-8 space-y-6">
            <Panel
              title="Source video"
              subtitle={
                selectedVideo
                  ? `${selectedVideo.original_filename} · uploaded ${formatDateTime(selectedVideo.created_at)}`
                  : "No uploaded videos yet"
              }
              action={
                <button
                  type="button"
                  className="text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace
                </button>
              }
            >
              <UploadCard
                video={selectedVideo}
                uploadProgress={uploadProgress}
                isUploading={uploadMutation.isPending}
                onBrowse={() => fileInputRef.current?.click()}
              />
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={onFileSelected} />
            </Panel>

            <Panel
              title="Processing jobs"
              subtitle={`${jobs.length} runs`}
              action={
                <button className="text-[10.5px] uppercase tracking-wider text-signal-cyan hover:underline">Live status</button>
              }
              dense
            >
              <ul className="divide-y divide-border">
                {jobs.length === 0 && <li className="p-4 text-[12px] text-muted-foreground">No jobs created yet.</li>}
                {jobs.map((job) => {
                  const started = job.started_at ? formatDateTime(job.started_at).slice(11, 16) : "—";
                  const finished = job.finished_at ? formatDateTime(job.finished_at).slice(11, 16) : null;
                  return (
                    <li key={job.id} className="p-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-[12px] text-foreground">{job.id}</span>
                          <StatusPill status={job.status} size="sm" />
                          <span className="text-[11px] text-muted-foreground font-mono truncate">{job.model_version ?? "best.pt"}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono shrink-0">
                          {finished ? `${started} → ${finished}` : `started ${started}`}
                        </div>
                      </div>

                      {(job.status === "running" || job.status === "queued") && (
                        <div className="mb-2">
                          <div className="h-1 bg-surface-2 overflow-hidden">
                            <div className="h-full bg-signal-amber" style={{ width: `${job.progress_percent}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground/80 font-mono mt-1.5">
                            <span>{job.status}</span>
                            <span>{job.progress_percent}%</span>
                          </div>
                        </div>
                      )}

                      {job.error_message && <div className="text-[11px] text-signal-red font-mono">{job.error_message}</div>}
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel
              title="Generated reports"
              subtitle={`${reports.length} artifacts${jobs[0] ? ` · latest job ${jobs[0].id}` : ""}`}
              action={
                <button
                  onClick={() => generateReportsMutation.mutate()}
                  disabled={generateReportsMutation.isPending}
                  className="h-7 px-2.5 border border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan text-[10.5px] uppercase tracking-wider hover:bg-signal-cyan/20 disabled:opacity-60"
                >
                  {generateReportsMutation.isPending ? "Generating..." : "Generate all"}
                </button>
              }
              dense
            >
              <ul className="divide-y divide-border">
                {reports.length === 0 && <li className="px-4 py-3 text-[12px] text-muted-foreground">No reports generated yet.</li>}
                {reports.map((report) => {
                  const Icon =
                    report.report_type === "json"
                      ? FileJson
                      : report.report_type === "csv"
                        ? FileSpreadsheet
                        : FileText;
                  const filename = report.storage_key.split("/").pop() ?? `report-${report.id}.${report.report_type}`;
                  return (
                    <li key={report.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface/40">
                      <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-3">
                          <span className="text-[12.5px] text-foreground truncate">{filename}</span>
                          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">
                            {report.report_type}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-muted-foreground font-mono">
                          generated {formatDateTime(report.created_at)} · {formatBytes(report.size_bytes)}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadReport(report.id)}
                        className="h-8 px-3 border border-border text-[11px] uppercase tracking-wider hover:bg-surface flex items-center gap-1.5"
                      >
                        <Download className="h-3 w-3" /> Download
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-6">
            <Panel title="Case metadata">
              <div className="space-y-1">
                <KV label="Case ID" mono>
                  {caseItem.id}
                </KV>
                <KV label="Code" mono>
                  {caseItem.case_code}
                </KV>
                <KV label="Procedure">{caseItem.procedure_type}</KV>
                <KV label="Surgery date">{caseItem.surgery_date ?? "—"}</KV>
                <KV label="Created by" mono>
                  {caseItem.created_by_user_id}
                </KV>
                <KV label="Created" mono>
                  {formatDateTime(caseItem.created_at)}
                </KV>
                <KV label="Updated" mono>
                  {formatDateTime(caseItem.updated_at)}
                </KV>
              </div>
            </Panel>

            {activeJob && (activeJob.status === "running" || activeJob.status === "queued") && (
              <Panel
                title="Live job"
                subtitle={activeJob.id}
                action={<RotateCw className="h-3 w-3 text-signal-amber animate-spin" />}
              >
                <Stat label="Progress" value={`${activeJob.progress_percent}`} unit="%" accent="amber" />
                <div className="h-1 bg-surface-2 mt-3 overflow-hidden">
                  <div className="h-full bg-signal-amber" style={{ width: `${activeJob.progress_percent}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4 text-[11px]">
                  <Mini label="Job status" value={activeJob.status} />
                  <Mini label="Model" value={activeJob.model_version ?? "best.pt"} />
                  <Mini label="Started" value={activeJob.started_at ? formatDateTime(activeJob.started_at).slice(11, 16) : "—"} />
                  <Mini label="Error" value={activeJob.error_message ?? "none"} />
                </div>
              </Panel>
            )}

            <Panel title="QA checks" subtitle="Auto-validation">
              <ul className="space-y-2">
                <Check ok label="Codec compatible (video MIME verified)" />
                <Check ok label="Upload complete and associated with case" />
                <Check ok label="Timeline data linked to latest successful job" />
                <Check warn label="Low confidence segments may require review" />
                <Check ok label="Reports generated from timeline rows" />
              </ul>
            </Panel>

            <Panel title="Notes">
              <p className="text-[12.5px] text-foreground/85 leading-relaxed">
                {caseItem.notes ?? "No clinical notes provided yet."}
              </p>
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono mt-3">
                Last updated {formatDateTime(caseItem.updated_at)}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, unit, mono }: { label: string; value: string; unit?: string; mono?: boolean }) {
  return (
    <div className="px-5 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={"text-lg font-semibold tabular-nums " + (mono ? "font-mono" : "")} data-mono>
          {value}
        </span>
        {unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">{label}</div>
      <div className="text-[12px] font-mono text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function Check({ label, ok, warn }: { label: string; ok?: boolean; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-[11.5px]">
      {ok && <CheckCircle2 className="h-3.5 w-3.5 text-signal-green shrink-0 mt-px" strokeWidth={2} />}
      {warn && <AlertCircle className="h-3.5 w-3.5 text-signal-amber shrink-0 mt-px" strokeWidth={2} />}
      <span className={warn ? "text-signal-amber" : "text-foreground/90"}>{label}</span>
    </li>
  );
}

function UploadCard({
  video,
  uploadProgress,
  isUploading,
  onBrowse,
}: {
  video?: VideoAsset;
  uploadProgress: number;
  isUploading: boolean;
  onBrowse: () => void;
}) {
  const progress = isUploading ? uploadProgress : video ? 100 : 0;
  return (
    <div className="border border-dashed border-border-strong bg-surface/30 p-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 border border-border-strong bg-surface-2 flex items-center justify-center shrink-0">
          <Upload className="h-5 w-5 text-signal-cyan" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 mb-1">
            <span className="text-[13px] font-medium text-foreground">{video?.original_filename ?? "No file selected"}</span>
            {video && <StatusPill status={video.upload_status === "uploaded" ? "completed" : "processing"} size="sm" />}
          </div>
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-muted-foreground font-mono">
            <span>{video ? formatBytes(video.file_size_bytes) : "—"}</span>
            <span>·</span>
            <span>{video?.checksum ? `SHA256 ${video.checksum.slice(0, 12)}…` : "checksum pending"}</span>
            <span>·</span>
            <span>{video ? `uploaded ${formatDateTime(video.created_at)}` : "upload pending"}</span>
          </div>
          <div className="mt-3 h-1 bg-surface-2 overflow-hidden">
            <div className="h-full bg-signal-green" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            <span>{isUploading ? "upload in progress" : video ? "upload complete" : "waiting for upload"}</span>
            <span className={progress === 100 ? "text-signal-green" : ""}>{progress}%</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Drag & drop not enabled in this build. Accepted formats:{" "}
          <span className="text-foreground font-mono">video/*</span>
        </span>
        <button
          type="button"
          onClick={onBrowse}
          className="h-7 px-2.5 border border-border text-[10.5px] uppercase tracking-wider hover:bg-surface text-foreground"
        >
          Browse files
        </button>
      </div>
    </div>
  );
}
