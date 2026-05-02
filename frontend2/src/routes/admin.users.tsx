import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Shield } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/clinical/primitives";
import { apiRequest } from "@/lib/api";
import { formatDateTime, initials } from "@/lib/format";
import type { MeResponse, User, UserRole, UsersListResponse } from "@/lib/types";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "User management — Laparoscopy Assistant" }] }),
  component: AdminUsers,
});

function AdminUsers() {
  const queryClient = useQueryClient();
  const isBrowser = typeof window !== "undefined";
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const meQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => apiRequest<MeResponse>("/auth/me"),
    enabled: isBrowser,
  });

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiRequest<UsersListResponse>("/users?page=1&page_size=100"),
    enabled: isBrowser,
  });

  const updateUserMutation = useMutation({
    mutationFn: (payload: { userId: string; updates: Partial<Pick<User, "role" | "is_active">> }) =>
      apiRequest<User>(`/users/${payload.userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload.updates),
      }),
    onSuccess: () => {
      toast.success("User updated.");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "User update failed.");
    },
  });

  const filteredUsers = useMemo(() => {
    return (usersQuery.data?.items ?? []).filter((user) => {
      const matchesSearch = searchTerm.trim()
        ? `${user.full_name} ${user.email}`.toLowerCase().includes(searchTerm.trim().toLowerCase())
        : true;
      const matchesRole = roleFilter === "all" ? true : user.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" ? true : statusFilter === "active" ? user.is_active : !user.is_active;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, searchTerm, statusFilter, usersQuery.data?.items]);

  const isAdmin = meQuery.data?.user.role === "admin";

  if (usersQuery.error) {
    return (
      <div className="p-6 text-sm text-signal-red">
        Unable to load users. This section requires an admin account.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-[1500px]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-signal-amber font-mono mb-1.5 flex items-center gap-2">
            <Shield className="h-3 w-3" /> Administration · Users
          </div>
          <h1 className="text-2xl font-semibold text-foreground">User management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Admin-only · {filteredUsers.length} users visible in this workspace.
          </p>
        </div>
        <button
          disabled
          className="h-9 px-3 border border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan text-[11.5px] uppercase tracking-wider flex items-center gap-2 opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> Invite user
        </button>
      </div>

      <div className="border border-border bg-card flex items-center gap-3 px-4 h-12">
        <div className="flex items-center h-8 border border-border bg-surface px-2.5 gap-2 flex-1 max-w-md">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name, email…"
            className="bg-transparent flex-1 text-[12px] outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <select
          className="h-8 bg-surface border border-border px-2.5 text-[11.5px]"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)}
        >
          <option value="all">All roles</option>
          <option value="admin">admin</option>
          <option value="surgeon">surgeon</option>
          <option value="doctor">doctor</option>
        </select>
        <select
          className="h-8 bg-surface border border-border px-2.5 text-[11.5px]"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <Panel dense>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border bg-surface/50">
              <th className="font-medium px-4 py-2.5">User</th>
              <th className="font-medium py-2.5">Role</th>
              <th className="font-medium py-2.5">Status</th>
              <th className="font-medium py-2.5">Last seen</th>
              <th className="font-medium py-2.5 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                  No users match the selected filters.
                </td>
              </tr>
            )}
            {filteredUsers.map((user) => {
              const isUpdating = updateUserMutation.isPending && updateUserMutation.variables?.userId === user.id;
              return (
                <tr key={user.id} className="border-b border-border/60 hover:bg-surface/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-7 w-7 border border-border-strong bg-surface-2 flex items-center justify-center text-[10.5px] font-semibold">
                        {initials(user.full_name)}
                      </div>
                      <div>
                        <div className="text-foreground font-medium">{user.full_name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <select
                      value={user.role}
                      onChange={(event) =>
                        updateUserMutation.mutate({
                          userId: user.id,
                          updates: { role: event.target.value as UserRole },
                        })
                      }
                      disabled={!isAdmin || isUpdating}
                      className="h-7 bg-surface border border-border px-2 text-[11px] font-mono uppercase tracking-wider disabled:opacity-60"
                    >
                      <option value="admin">admin</option>
                      <option value="surgeon">surgeon</option>
                      <option value="doctor">doctor</option>
                    </select>
                  </td>
                  <td className="py-3">
                    <span
                      className={
                        "inline-flex items-center gap-1.5 px-2 h-6 border text-[10.5px] uppercase tracking-wider font-medium " +
                        (user.is_active
                          ? "border-signal-green/30 bg-signal-green/10 text-signal-green"
                          : "border-border text-muted-foreground bg-muted/30")
                      }
                    >
                      <span className={"h-1.5 w-1.5 rounded-full " + (user.is_active ? "bg-signal-green" : "bg-muted-foreground")} />
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 text-muted-foreground font-mono text-[11px]">{formatDateTime(user.updated_at)}</td>
                  <td className="py-3 pr-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        disabled
                        className="h-7 px-2.5 border border-border text-[10.5px] uppercase tracking-wider opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          updateUserMutation.mutate({
                            userId: user.id,
                            updates: { is_active: !user.is_active },
                          })
                        }
                        disabled={!isAdmin || isUpdating}
                        className={
                          "h-7 px-2.5 border text-[10.5px] uppercase tracking-wider disabled:opacity-60 " +
                          (user.is_active
                            ? "border-signal-red/30 text-signal-red hover:bg-signal-red/10"
                            : "border-signal-green/30 text-signal-green hover:bg-signal-green/10")
                        }
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <div className="text-[11px] text-muted-foreground font-mono">
        Showing <span className="text-foreground">1–{filteredUsers.length}</span> of{" "}
        <span className="text-foreground">{usersQuery.data?.pagination.total ?? filteredUsers.length}</span> ·
        server endpoint <span className="text-foreground">GET /users?page=1&page_size=100</span>
      </div>
    </div>
  );
}
