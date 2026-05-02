import { clearAuthTokens, getAccessToken } from "@/lib/auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");

export class APIError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function buildApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function extractDetailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item && typeof item.msg === "string") {
          return item.msg;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    if (parts.length > 0) return parts.join("; ");
  }

  if ("message" in payload && typeof (payload as { message?: unknown }).message === "string") {
    return (payload as { message: string }).message;
  }

  return null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  let message = `Request failed with status ${response.status}.`;
  try {
    const payload = (await response.json()) as unknown;
    message = extractDetailMessage(payload) ?? message;
  } catch {
    if (response.statusText) {
      message = response.statusText;
    }
  }

  if (response.status === 401) {
    clearAuthTokens();
  }

  throw new APIError(message, response.status);
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (authenticated) {
    const token = getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers,
  });

  return parseResponse<T>(response);
}

function extractFilename(contentDisposition: string | null): string | undefined {
  if (!contentDisposition) return undefined;

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]).replace(/[\\/:*?"<>|]/g, "_");
  }

  const plainMatch = /filename="?([^"]+)"?/i.exec(contentDisposition);
  if (plainMatch?.[1]) {
    return plainMatch[1].replace(/[\\/:*?"<>|]/g, "_");
  }
  return undefined;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined") {
    throw new APIError("Downloads are only available in a browser session.", 500);
  }
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export async function apiDownloadReport(reportId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new APIError("Missing authentication token.", 401);
  }

  const response = await fetch(buildApiUrl(`/reports/${reportId}/download`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as unknown;
      message = extractDetailMessage(payload) ?? message;
    } catch {
      if (response.statusText) {
        message = response.statusText;
      }
    }
    if (response.status === 401) {
      clearAuthTokens();
    }
    throw new APIError(message, response.status);
  }

  const contentDisposition = response.headers.get("content-disposition");
  if (contentDisposition?.toLowerCase().includes("attachment")) {
    const blob = await response.blob();
    const filename = extractFilename(contentDisposition) ?? `report-${reportId}`;
    triggerBlobDownload(blob, filename);
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.clone().json()) as { download_url?: string };
      if (payload.download_url) {
        window.open(payload.download_url, "_blank", "noopener,noreferrer");
        return;
      }
    } catch {
      // Continue to blob fallback when response is a JSON file.
    }
  }

  const blob = await response.blob();
  triggerBlobDownload(blob, `report-${reportId}`);
}

export function apiUploadFile<T>({
  path,
  file,
  checksum,
  onProgress,
}: {
  path: string;
  file: File;
  checksum?: string;
  onProgress?: (value: number) => void;
}): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new APIError("Missing authentication token.", 401);
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    if (checksum) {
      formData.append("checksum", checksum);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildApiUrl(path));
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as T);
        return;
      }
      try {
        const payload = JSON.parse(xhr.responseText) as unknown;
        reject(new APIError(extractDetailMessage(payload) ?? "Upload failed.", xhr.status));
      } catch {
        reject(new APIError("Upload failed.", xhr.status));
      }
    };
    xhr.onerror = () => reject(new APIError("Upload request failed.", 500));
    xhr.send(formData);
  });
}
