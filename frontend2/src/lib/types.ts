export type UserRole = "surgeon" | "doctor" | "admin";
export type CaseStatus = "draft" | "uploaded" | "processing" | "completed" | "failed" | "archived";
export type UploadStatus = "pending" | "uploaded" | "deleted";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type ReportType = "json" | "csv" | "pdf" | "png";

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
}

export interface MessageResponse {
  message: string;
}

export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeResponse {
  user: User;
  organization_id: string | null;
}

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface SurgeryCase {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  case_code: string;
  procedure_type: string;
  surgery_date: string | null;
  notes: string | null;
  de_identification_notes: string | null;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
}

export interface CasesListResponse {
  items: SurgeryCase[];
  pagination: PaginationMeta;
}

export interface CaseCreateRequest {
  case_code: string;
  procedure_type: string;
  surgery_date?: string;
  notes?: string;
  de_identification_notes?: string;
}

export interface VideoAsset {
  id: string;
  case_id: string;
  uploader_user_id: string;
  storage_key: string;
  original_filename: string;
  file_size_bytes: number;
  duration_sec: number | null;
  mime_type: string;
  checksum: string | null;
  upload_status: UploadStatus;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  case_id: string;
  video_asset_id: string;
  status: JobStatus;
  progress_percent: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  model_version: string | null;
  created_at: string;
}

export interface ProcessCaseRequest {
  video_asset_id?: string;
  model_version?: string;
}

export interface ToolTimelineEntry {
  id: string;
  job_id: string;
  track_id: number;
  tool_name: string;
  class_id: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  mean_conf: number;
  frame_count: number;
}

export interface GeneratedReport {
  id: string;
  case_id: string;
  job_id: string;
  report_type: ReportType;
  storage_key: string;
  size_bytes: number;
  created_at: string;
}

export interface ReportsListResponse {
  items: GeneratedReport[];
  pagination: PaginationMeta;
}

export interface UsersListResponse {
  items: User[];
  pagination: PaginationMeta;
}
