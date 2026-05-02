import { useEffect, type ComponentType, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, FileText, LayoutDashboard, LogOut, Search, Settings, Users } from "lucide-react";
import { toast } from "sonner";

import { APIError, apiRequest } from "@/lib/api";
import { clearAuthTokens, getAccessToken, getRefreshToken } from "@/lib/auth";
import { initials } from "@/lib/format";
import type { MeResponse, MessageResponse, Organization } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Kbd } from "./primitives";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/cases", label: "Cases", icon: FolderOpen },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const ADMIN_NAV = [{ to: "/admin/users", label: "Users", icon: Users }] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasToken = typeof window !== "undefined" && Boolean(getAccessToken());

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => apiRequest<MeResponse>("/auth/me"),
    retry: false,
    enabled: hasToken,
  });

  const organizationQuery = useQuery({
    queryKey: ["organization-current", sessionQuery.data?.organization_id],
    queryFn: () => apiRequest<Organization>("/organizations/current"),
    enabled: Boolean(sessionQuery.data?.organization_id),
  });

  useEffect(() => {
    if (!hasToken) {
      void navigate({ to: "/login", replace: true });
    }
  }, [hasToken, navigate]);

  useEffect(() => {
    if (sessionQuery.error instanceof APIError && sessionQuery.error.status === 401) {
      clearAuthTokens();
      void navigate({ to: "/login", replace: true });
    }
  }, [navigate, sessionQuery.error]);

  const handleLogout = async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await apiRequest<MessageResponse>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch (error) {
        if (!(error instanceof APIError && error.status === 404)) {
          toast.error(error instanceof Error ? error.message : "Logout failed.");
        }
      }
    }

    clearAuthTokens();
    queryClient.clear();
    toast.success("Signed out.");
    void navigate({ to: "/login", replace: true });
  };

  const currentUser = sessionQuery.data?.user;
  const organizationName = organizationQuery.data?.name ?? "Laparoscopy Assistant";

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-[220px] shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-12 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
          <div className="h-5 w-5 border border-signal-cyan flex items-center justify-center">
            <div className="h-1.5 w-1.5 bg-signal-cyan pulse-dot" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] font-semibold tracking-wide text-foreground">LAPAROSCOPY</span>
            <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">Assistant · v3.2</span>
          </div>
        </div>

        <nav className="flex-1 py-3">
          <SidebarGroup label="Workspace">
            {NAV.map((n) => (
              <SidebarLink key={n.to} item={n} active={path === n.to || path.startsWith(`${n.to}/`)} />
            ))}
          </SidebarGroup>

          {currentUser?.role === "admin" && (
            <SidebarGroup label="Administration">
              {ADMIN_NAV.map((n) => (
                <SidebarLink key={n.to} item={n} active={path.startsWith(n.to)} />
              ))}
            </SidebarGroup>
          )}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-3 flex items-center gap-2.5">
          <div className="h-7 w-7 border border-border-strong bg-surface-2 flex items-center justify-center text-[11px] font-semibold text-foreground">
            {initials(currentUser?.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-foreground truncate">
              {currentUser?.full_name ?? "Loading user..."}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {currentUser?.role ?? "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="h-7 w-7 border border-border-strong flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
        <FootBar organizationName={organizationName} />
      </div>
    </div>
  );
}

function SidebarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-4 mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">{label}</div>
      <ul>{children}</ul>
    </div>
  );
}

function SidebarLink({
  item,
  active,
}: {
  item: { to: string; label: string; icon: ComponentType<{ className?: string }> };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.to}
        className={cn(
          "group flex items-center gap-3 h-8 px-4 text-[12.5px] relative",
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        {active && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-signal-cyan" />}
        <Icon className={cn("h-3.5 w-3.5", active ? "text-signal-cyan" : "text-muted-foreground")} />
        <span className="flex-1">{item.label}</span>
      </Link>
    </li>
  );
}

function TopBar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const segments = path.split("/").filter(Boolean);
  return (
    <header className="h-12 border-b border-border bg-background/80 backdrop-blur flex items-center gap-4 px-5">
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        {segments.length === 0 ? (
          <span className="text-foreground">overview</span>
        ) : (
          segments.map((s, i) => (
            <span key={i} className={cn(i === segments.length - 1 ? "text-foreground" : "")}>
              {s}
              {i < segments.length - 1 && <span className="mx-1 text-border-strong">/</span>}
            </span>
          ))
        )}
      </div>

      <div className="flex-1 max-w-md ml-6">
        <div className="flex items-center h-8 border border-border bg-surface px-2.5 gap-2 hover:border-border-strong transition-colors">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Jump to case, report, surgeon…"
            className="bg-transparent flex-1 text-[12px] outline-none placeholder:text-muted-foreground/60"
          />
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </div>
      </div>
    </header>
  );
}

function FootBar({ organizationName }: { organizationName: string }) {
  return (
    <footer className="h-7 border-t border-border bg-sidebar text-[10px] uppercase tracking-[0.16em] text-muted-foreground flex items-center justify-between px-5">
      <div>© {organizationName}</div>
      <div className="flex items-center gap-4 normal-case tracking-normal text-[11px]">
        <a href="#" className="hover:text-foreground">
          Help center
        </a>
        <a href="#" className="hover:text-foreground">
          Privacy
        </a>
        <a href="#" className="hover:text-foreground">
          Terms
        </a>
      </div>
    </footer>
  );
}
