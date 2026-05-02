import { useMemo, useState, type ButtonHTMLAttributes } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

import { formatDuration } from "@/lib/format";
import type { ToolTimelineEntry } from "@/lib/types";

const TOOL_COLOR_HINTS: Array<{ pattern: RegExp; color: string }> = [
  { pattern: /grasper/i, color: "var(--color-tool-grasper)" },
  { pattern: /scissors?/i, color: "var(--color-tool-scissors)" },
  { pattern: /clip/i, color: "var(--color-tool-clipper)" },
  { pattern: /hook|electrocautery/i, color: "var(--color-tool-hook)" },
  { pattern: /irrigat/i, color: "var(--color-tool-irrigator)" },
  { pattern: /bipolar/i, color: "var(--color-tool-bipolar)" },
  { pattern: /specimen/i, color: "var(--color-tool-specimen)" },
];

const FALLBACK_COLORS = [
  "var(--color-tool-grasper)",
  "var(--color-tool-hook)",
  "var(--color-tool-clipper)",
  "var(--color-tool-scissors)",
  "var(--color-tool-irrigator)",
  "var(--color-tool-bipolar)",
  "var(--color-signal-violet)",
  "var(--color-signal-cyan)",
];

type NormalizedSegment = {
  id: string;
  tool: string;
  start_s: number;
  end_s: number;
  confidence: number;
  track: number;
};

type ToolRow = {
  tool: string;
  color: string;
  firstStart: number;
  segments: NormalizedSegment[];
};

function colorForTool(toolName: string, fallbackIndex: number): string {
  const known = TOOL_COLOR_HINTS.find((hint) => hint.pattern.test(toolName));
  if (known) return known.color;
  return FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length] ?? "var(--color-signal-cyan)";
}

export function Timeline({ segments = [] }: { segments?: ToolTimelineEntry[] }) {
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<{ seg: NormalizedSegment; color: string; x: number; y: number } | null>(null);

  const normalized = useMemo<NormalizedSegment[]>(
    () =>
      segments
        .filter((segment) => segment.end_sec > segment.start_sec)
        .map((segment) => ({
          id: segment.id,
          tool: segment.tool_name,
          start_s: segment.start_sec,
          end_s: segment.end_sec,
          confidence: segment.mean_conf,
          track: segment.track_id,
        }))
        .sort((a, b) => a.start_s - b.start_s || a.track - b.track),
    [segments],
  );

  const totalDuration = useMemo(
    () => Math.max(normalized.reduce((max, segment) => Math.max(max, segment.end_s), 0), 1),
    [normalized],
  );

  const toolRows = useMemo<ToolRow[]>(() => {
    const map = new Map<string, ToolRow>();
    normalized.forEach((segment) => {
      const existing = map.get(segment.tool);
      if (existing) {
        existing.segments.push(segment);
        existing.firstStart = Math.min(existing.firstStart, segment.start_s);
        return;
      }
      map.set(segment.tool, {
        tool: segment.tool,
        color: colorForTool(segment.tool, map.size),
        firstStart: segment.start_s,
        segments: [segment],
      });
    });

    return Array.from(map.values()).sort((a, b) => a.firstStart - b.firstStart || a.tool.localeCompare(b.tool));
  }, [normalized]);

  const widthPct = zoom * 100;
  const ticks = useMemo(() => {
    const tickCount = zoom <= 1 ? 6 : zoom <= 2 ? 10 : 16;
    const out: number[] = [];
    for (let i = 0; i <= tickCount; i += 1) {
      out.push((totalDuration * i) / tickCount);
    }
    return out;
  }, [totalDuration, zoom]);

  if (toolRows.length === 0) {
    return <div className="text-[12px] text-muted-foreground">No timeline data available yet.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>00:00</span>
          <span className="text-border-strong">→</span>
          <span className="text-foreground">{formatDuration(totalDuration)}</span>
          <span className="ml-3 text-border-strong">·</span>
          <span className="ml-1">{normalized.length} segments</span>
        </div>
        <div className="flex items-center gap-1">
          <ZoomBtn onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1}>
            <ZoomOut className="h-3 w-3" />
          </ZoomBtn>
          <span className="px-2 text-[10.5px] font-mono text-muted-foreground tabular-nums w-12 text-center">
            {zoom.toFixed(1)}x
          </span>
          <ZoomBtn onClick={() => setZoom((z) => Math.min(8, z * 1.5))} disabled={zoom >= 8}>
            <ZoomIn className="h-3 w-3" />
          </ZoomBtn>
          <ZoomBtn onClick={() => setZoom(1)}>
            <Maximize2 className="h-3 w-3" />
          </ZoomBtn>
        </div>
      </div>

      <div className="border border-border bg-surface/40 overflow-x-auto relative">
        <div style={{ width: `${widthPct}%`, minWidth: "100%" }} className="relative">
          <div className="h-7 border-b border-border relative">
            {ticks.map((tick, index) => (
              <div
                key={`${tick}-${index}`}
                className="absolute top-0 bottom-0 border-l border-border"
                style={{ left: `${(tick / totalDuration) * 100}%` }}
              >
                <span className="absolute top-1.5 left-1.5 text-[10px] font-mono text-muted-foreground tabular-nums">
                  {formatDuration(tick)}
                </span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-border/60">
            {toolRows.map((row) => {
              const tracks = Math.max(1, ...row.segments.map((segment) => segment.track + 1));
              return (
                <div key={row.tool} className="relative flex" style={{ height: tracks * 18 + 8 }}>
                  <div
                    className="sticky left-0 z-10 w-[150px] shrink-0 px-3 flex items-center gap-2 bg-surface/95 backdrop-blur border-r border-border"
                    style={{ position: "sticky" }}
                  >
                    <span className="h-2 w-2" style={{ background: row.color }} />
                    <span className="text-[11px] text-foreground/90 truncate">{row.tool}</span>
                  </div>

                  <div className="flex-1 relative py-1">
                    {ticks.map((tick, index) => (
                      <div
                        key={`${tick}-${index}`}
                        className="absolute top-0 bottom-0 border-l border-border/40"
                        style={{ left: `${(tick / totalDuration) * 100}%` }}
                      />
                    ))}
                    {row.segments.map((segment) => {
                      const left = (segment.start_s / totalDuration) * 100;
                      const width = ((segment.end_s - segment.start_s) / totalDuration) * 100;
                      return (
                        <div
                          key={segment.id}
                          className="absolute h-[14px] cursor-pointer transition-all hover:brightness-125"
                          style={{
                            left: `${left}%`,
                            width: `max(${width}%, 2px)`,
                            top: 4 + segment.track * 18,
                            background: row.color,
                            opacity: Math.max(0.35, Math.min(1, 0.4 + segment.confidence * 0.6)),
                            borderLeft: "1px solid rgba(0,0,0,0.4)",
                          }}
                          onMouseEnter={(event) => {
                            const rect = (event.target as HTMLElement).getBoundingClientRect();
                            const container = (event.currentTarget.closest(".overflow-x-auto") as HTMLElement).getBoundingClientRect();
                            setHover({
                              seg: segment,
                              color: row.color,
                              x: rect.left - container.left + rect.width / 2,
                              y: rect.top - container.top,
                            });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {hover && (
            <div
              className="absolute z-20 border border-border-strong bg-popover shadow-lg p-3 pointer-events-none w-[220px]"
              style={{ left: hover.x, top: hover.y - 6, transform: "translate(-50%, -100%)" }}
            >
              <div className="text-[11px] font-medium text-foreground mb-1.5 flex items-center gap-2">
                <span className="h-2 w-2" style={{ background: hover.color }} />
                {hover.seg.tool}
                <span className="ml-auto text-[10px] text-muted-foreground font-mono">trk {hover.seg.track}</span>
              </div>
              <div className="space-y-0.5 text-[10.5px] font-mono">
                <Row k="Start" v={formatDuration(hover.seg.start_s)} />
                <Row k="End" v={formatDuration(hover.seg.end_s)} />
                <Row k="Duration" v={formatDuration(hover.seg.end_s - hover.seg.start_s)} />
                <Row k="Confidence" v={`${(hover.seg.confidence * 100).toFixed(1)}%`} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-x-5 gap-y-2 pt-1">
        {toolRows.map((row) => {
          const total = row.segments.reduce((sum, segment) => sum + (segment.end_s - segment.start_s), 0);
          return (
            <div key={row.tool} className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2" style={{ background: row.color }} />
              <span className="text-foreground/90">{row.tool}</span>
              <span className="text-muted-foreground font-mono">
                {row.segments.length} · {formatDuration(total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground uppercase tracking-wider">{k}</span>
      <span className="text-foreground">{v}</span>
    </div>
  );
}

function ZoomBtn({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="h-7 w-7 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
