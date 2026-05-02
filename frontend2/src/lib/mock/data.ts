// Static prototype data only. No network. No persistence.

export type Role = "surgeon" | "doctor" | "admin";

export const currentUser = {
  id: "usr_8f2a91",
  full_name: "Dr. Anika Patel",
  email: "a.patel@ststephens.health",
  role: "admin" as Role,
  organization_id: "org_01HXR2",
  organization_name: "St. Stephen's Surgical Group",
  created_at: "2024-09-12T09:14:00Z",
};

export type CaseStatus = "draft" | "uploaded" | "processing" | "succeeded" | "failed" | "archived";

export type Procedure =
  | "Cholecystectomy"
  | "Appendectomy"
  | "Hernia Repair"
  | "Gastric Bypass"
  | "Colectomy"
  | "Nissen Fundoplication";

export type Case = {
  id: string;
  code: string;
  patient_ref: string;
  procedure: Procedure;
  surgeon: string;
  status: CaseStatus;
  duration_min: number;
  created_at: string;
  recorded_at: string;
  video_size_mb?: number;
  notes?: string;
};

const surgeons = [
  "Dr. A. Patel", "Dr. M. Okafor", "Dr. L. Chen", "Dr. R. Volkov",
  "Dr. S. Hassan", "Dr. J. Whitlock", "Dr. K. Nakamura",
];
const procedures: Procedure[] = [
  "Cholecystectomy", "Appendectomy", "Hernia Repair",
  "Gastric Bypass", "Colectomy", "Nissen Fundoplication",
];
const statuses: CaseStatus[] = [
  "succeeded","succeeded","succeeded","succeeded",
  "processing","processing",
  "uploaded","draft","failed","archived",
];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }
function pad(n: number, w = 4) { return n.toString().padStart(w, "0"); }

export const cases: Case[] = Array.from({ length: 47 }, (_, i) => {
  const id = `case_${(i + 101).toString(16)}`;
  const date = new Date(Date.UTC(2026, 3, 28 - Math.floor(i / 2), 9 + (i % 6), (i * 13) % 60));
  return {
    id,
    code: `LAP-${pad(2451 - i)}`,
    patient_ref: `PT-${pad((i * 37) % 9999, 5)}`,
    procedure: pick(procedures, i + 1),
    surgeon: pick(surgeons, i),
    status: pick(statuses, i),
    duration_min: 28 + ((i * 17) % 92),
    created_at: date.toISOString(),
    recorded_at: date.toISOString(),
    video_size_mb: 420 + ((i * 73) % 1800),
    notes: i % 4 === 0 ? "Standard 4-port laparoscopic approach. No intraoperative complications." : undefined,
  };
});

// Tools used in laparoscopic workflows (Cholec80-style)
export const TOOLS = [
  { key: "grasper",  label: "Grasper",   color: "var(--color-tool-grasper)" },
  { key: "scissors", label: "Scissors",  color: "var(--color-tool-scissors)" },
  { key: "clipper",  label: "Clipper",   color: "var(--color-tool-clipper)" },
  { key: "hook",     label: "Hook",      color: "var(--color-tool-hook)" },
  { key: "irrigator",label: "Irrigator", color: "var(--color-tool-irrigator)" },
  { key: "bipolar",  label: "Bipolar",   color: "var(--color-tool-bipolar)" },
  { key: "specimen", label: "Specimen Bag", color: "var(--color-tool-specimen)" },
] as const;

export type ToolKey = (typeof TOOLS)[number]["key"];

export type TimelineSegment = {
  tool: ToolKey;
  start_s: number;
  end_s: number;
  confidence: number; // 0..1
  track: number;
};

// Generate plausible timeline (54 minutes)
export const TIMELINE_DURATION_S = 54 * 60;

function genTimeline(seed: number): TimelineSegment[] {
  const segs: TimelineSegment[] = [];
  let r = seed;
  const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  TOOLS.forEach((t, idx) => {
    let cursor = Math.floor(rand() * 200);
    const tracks = t.key === "grasper" ? 2 : 1;
    while (cursor < TIMELINE_DURATION_S - 60) {
      const dur = 8 + Math.floor(rand() * (t.key === "grasper" ? 220 : 90));
      const gap = 20 + Math.floor(rand() * 240);
      segs.push({
        tool: t.key,
        start_s: cursor,
        end_s: Math.min(cursor + dur, TIMELINE_DURATION_S),
        confidence: 0.72 + rand() * 0.27,
        track: tracks > 1 ? Math.floor(rand() * tracks) : 0,
      });
      cursor += dur + gap;
    }
  });
  return segs;
}

export const timeline: TimelineSegment[] = genTimeline(424242);

// KPI series for dashboard sparklines
export const dailyCases = [4, 6, 5, 8, 7, 9, 11, 8, 10, 9, 12, 14, 11, 13, 12, 15, 14, 16, 13, 15, 17, 14, 16, 18, 15, 17, 19, 16, 18, 20];
export const successRate = [92, 91, 93, 94, 92, 95, 94, 96, 93, 95, 96, 97, 95, 96, 98, 96, 97, 98, 97, 98];

export type Job = {
  id: string;
  case_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  model_version: string;
  progress: number;
  started_at: string;
  finished_at?: string;
  events: { ts: string; level: "info" | "warn" | "error"; msg: string }[];
};

export const jobsForCase = (caseId: string): Job[] => [
  {
    id: "job_8af31c",
    case_id: caseId,
    status: "succeeded",
    model_version: "lap-detect-v3.2.1",
    progress: 100,
    started_at: "2026-04-28T09:14:00Z",
    finished_at: "2026-04-28T09:41:18Z",
    events: [
      { ts: "09:14:00", level: "info", msg: "Job queued" },
      { ts: "09:14:03", level: "info", msg: "Worker celery@gpu-02 acquired job" },
      { ts: "09:14:09", level: "info", msg: "Decoded 81,234 frames @ 25fps" },
      { ts: "09:18:44", level: "info", msg: "Inference checkpoint 25%" },
      { ts: "09:24:11", level: "warn", msg: "Low-light frames 12,408..12,690 — confidence floor 0.41" },
      { ts: "09:31:02", level: "info", msg: "Inference checkpoint 75%" },
      { ts: "09:39:55", level: "info", msg: "Generating timeline + reports" },
      { ts: "09:41:18", level: "info", msg: "Completed. 7 tracks, 412 segments." },
    ],
  },
  {
    id: "job_2c81fa",
    case_id: caseId,
    status: "running",
    model_version: "lap-detect-v3.2.2-rc1",
    progress: 64,
    started_at: "2026-05-01T08:42:00Z",
    events: [
      { ts: "08:42:00", level: "info", msg: "Job queued" },
      { ts: "08:42:04", level: "info", msg: "Worker celery@gpu-01 acquired job" },
      { ts: "08:48:11", level: "info", msg: "Inference checkpoint 25%" },
      { ts: "08:56:33", level: "info", msg: "Inference checkpoint 50%" },
    ],
  },
];

export type Report = {
  id: string;
  case_id: string;
  type: "json" | "csv" | "pdf";
  generated_at: string;
  size_kb: number;
};

export const reportsForCase = (caseId: string): Report[] => [
  { id: "rpt_a1", case_id: caseId, type: "pdf",  generated_at: "2026-04-28T09:41:30Z", size_kb: 482 },
  { id: "rpt_a2", case_id: caseId, type: "csv",  generated_at: "2026-04-28T09:41:30Z", size_kb: 31 },
  { id: "rpt_a3", case_id: caseId, type: "json", generated_at: "2026-04-28T09:41:30Z", size_kb: 124 },
];

export const allReports = cases.slice(0, 22).flatMap((c, i) => [
  { id: `rpt_${i}_p`, case_id: c.id, case_code: c.code, procedure: c.procedure, type: "pdf"  as const, generated_at: c.recorded_at, size_kb: 380 + i*7 },
  { id: `rpt_${i}_c`, case_id: c.id, case_code: c.code, procedure: c.procedure, type: "csv"  as const, generated_at: c.recorded_at, size_kb: 22 + i },
  { id: `rpt_${i}_j`, case_id: c.id, case_code: c.code, procedure: c.procedure, type: "json" as const, generated_at: c.recorded_at, size_kb: 110 + i*3 },
]);

// Admin users
export type AdminUser = {
  id: string; full_name: string; email: string; role: Role; is_active: boolean; last_seen: string;
};
export const adminUsers: AdminUser[] = [
  { id: "usr_8f2a91", full_name: "Dr. Anika Patel",  email: "a.patel@ststephens.health",  role: "admin",   is_active: true,  last_seen: "2026-05-01T08:51:00Z" },
  { id: "usr_3b71d2", full_name: "Dr. Marcus Okafor", email: "m.okafor@ststephens.health", role: "surgeon", is_active: true,  last_seen: "2026-05-01T08:12:00Z" },
  { id: "usr_44c0e9", full_name: "Dr. Liu Chen",       email: "l.chen@ststephens.health",   role: "surgeon", is_active: true,  last_seen: "2026-04-30T17:42:00Z" },
  { id: "usr_5da218", full_name: "Dr. Roman Volkov",   email: "r.volkov@ststephens.health", role: "surgeon", is_active: false, last_seen: "2026-04-12T10:01:00Z" },
  { id: "usr_61b4aa", full_name: "Dr. Sara Hassan",    email: "s.hassan@ststephens.health", role: "doctor",  is_active: true,  last_seen: "2026-05-01T07:30:00Z" },
  { id: "usr_7e0f72", full_name: "Dr. James Whitlock", email: "j.whitlock@ststephens.health", role: "doctor", is_active: true,  last_seen: "2026-04-29T12:18:00Z" },
  { id: "usr_8a9933", full_name: "Dr. Kenji Nakamura", email: "k.nakamura@ststephens.health", role: "surgeon", is_active: true, last_seen: "2026-04-30T22:09:00Z" },
];

export function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`;
}
export function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toISOString().slice(0,10) + " " + d.toISOString().slice(11,16) + "Z";
}
