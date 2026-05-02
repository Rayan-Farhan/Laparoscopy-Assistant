import { FormEvent, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, GhostButton, Input, PrimaryButton, Select } from "@/components/clinical/auth-shell";
import { KV, Panel } from "@/components/clinical/primitives";
import { apiRequest } from "@/lib/api";
import { formatDateTime, initials } from "@/lib/format";
import type { MeResponse, MessageResponse, Organization, User } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Laparoscopy Assistant" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const isBrowser = typeof window !== "undefined";
  const meQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => apiRequest<MeResponse>("/auth/me"),
    enabled: isBrowser,
  });

  const organizationQuery = useQuery({
    queryKey: ["settings", "organization"],
    queryFn: () => apiRequest<Organization>("/organizations/current"),
    enabled: isBrowser && Boolean(meQuery.data?.organization_id),
  });

  const [fullNameDraft, setFullNameDraft] = useState("");
  useEffect(() => {
    if (meQuery.data?.user.full_name) {
      setFullNameDraft(meQuery.data.user.full_name);
    }
  }, [meQuery.data?.user.full_name]);

  const profileUpdateMutation = useMutation({
    mutationFn: (payload: { full_name: string }) => {
      if (meQuery.data?.user.role !== "admin") {
        throw new Error("Profile update is currently admin-only in the backend API.");
      }
      return apiRequest<User>(`/users/${meQuery.data.user.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success("Profile updated.");
      queryClient.invalidateQueries({ queryKey: ["session"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Profile update failed.");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { current_password: string; new_password: string }) =>
      apiRequest<MessageResponse>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (response) => {
      toast.success(response.message);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Password update failed.");
    },
  });

  const onEditProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    profileUpdateMutation.mutate({ full_name: fullNameDraft.trim() });
  };

  const onChangePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("current_password") ?? "");
    const newPassword = String(form.get("new_password") ?? "");
    const confirmPassword = String(form.get("confirm_password") ?? "");

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    changePasswordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
    });
    event.currentTarget.reset();
  };

  const user = meQuery.data?.user;

  return (
    <div className="p-6 space-y-6 max-w-[1300px]">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-1.5">
          Workspace · Settings
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Profile & organization</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account, security, and organization-wide preferences.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 lg:col-span-3">
          <nav className="border border-border bg-card divide-y divide-border">
            {[
              { code: "S1", label: "Profile", active: true },
              { code: "S2", label: "Security", active: false },
              { code: "S3", label: "Organization", active: false },
              { code: "S4", label: "API & integrations", active: false },
              { code: "S5", label: "Notifications", active: false },
              { code: "S6", label: "Data & export", active: false },
            ].map((item) => (
              <button
                key={item.code}
                className={
                  "w-full flex items-center justify-between px-4 h-10 text-[12px] " +
                  (item.active
                    ? "bg-surface text-foreground border-l-2 border-signal-cyan"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface/50")
                }
              >
                <span>{item.label}</span>
                <span className="text-[10px] font-mono text-muted-foreground/60">{item.code}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="col-span-12 lg:col-span-9 space-y-6">
          <Panel
            title="Profile"
            subtitle="Synced from /auth/me"
            action={
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ["session"] })}
                className="text-[10.5px] uppercase tracking-wider text-signal-cyan hover:underline"
              >
                Refresh
              </button>
            }
          >
            <div className="flex items-start gap-5">
              <div className="h-16 w-16 border border-border-strong bg-surface-2 flex items-center justify-center text-xl font-semibold text-foreground shrink-0">
                {initials(user?.full_name)}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-1">
                <KV label="Full name">{user?.full_name ?? "—"}</KV>
                <KV label="Role" mono>
                  {user?.role ?? "—"}
                </KV>
                <KV label="Email" mono>
                  {user?.email ?? "—"}
                </KV>
                <KV label="User ID" mono>
                  {user?.id ?? "—"}
                </KV>
                <KV label="Organization">{organizationQuery.data?.name ?? "—"}</KV>
                <KV label="Org ID" mono>
                  {meQuery.data?.organization_id ?? "—"}
                </KV>
                <KV label="Created" mono>
                  {formatDateTime(user?.created_at)}
                </KV>
                <KV label="Last sign-in" mono>
                  {formatDateTime(user?.updated_at)}
                </KV>
              </div>
            </div>
          </Panel>

          <Panel title="Edit profile" subtitle="PATCH /users/{id} (admin only)">
            <form className="grid grid-cols-2 gap-4" onSubmit={onEditProfile}>
              <Field label="Full name" required>
                <Input value={fullNameDraft} onChange={(event) => setFullNameDraft(event.target.value)} required />
              </Field>
              <Field label="Email">
                <Input type="email" value={user?.email ?? ""} readOnly />
              </Field>
              <Field label="Display title">
                <Input defaultValue="Surgical team member" />
              </Field>
              <Field label="Locale">
                <Select defaultValue="en-GB">
                  <option value="en-GB">English (United Kingdom)</option>
                  <option value="en-US">English (United States)</option>
                  <option value="de-DE">Deutsch</option>
                </Select>
              </Field>
              <div className="col-span-2 border border-border bg-surface p-3 text-[11.5px] text-muted-foreground">
                The current backend exposes profile updates through admin user endpoints only.
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <div className="w-32">
                  <GhostButton type="button" onClick={() => setFullNameDraft(user?.full_name ?? "")}>
                    Discard
                  </GhostButton>
                </div>
                <div className="w-44">
                  <PrimaryButton type="submit" disabled={profileUpdateMutation.isPending || user?.role !== "admin"}>
                    {profileUpdateMutation.isPending ? "Saving..." : "Save changes"}
                  </PrimaryButton>
                </div>
              </div>
            </form>
          </Panel>

          <Panel title="Change password" subtitle="POST /auth/change-password">
            <form className="grid grid-cols-2 gap-4" onSubmit={onChangePassword}>
              <Field label="Current password" required>
                <Input name="current_password" type="password" placeholder="••••••••••••" required minLength={8} />
              </Field>
              <div />
              <Field label="New password" required hint="min 8 chars">
                <Input name="new_password" type="password" placeholder="••••••••••••" required minLength={8} />
              </Field>
              <Field label="Confirm new password" required>
                <Input name="confirm_password" type="password" placeholder="••••••••••••" required minLength={8} />
              </Field>
              <div className="col-span-2 border border-signal-amber/30 bg-signal-amber/10 p-3 text-[11.5px] text-foreground/90 leading-relaxed">
                <span className="text-signal-amber font-mono uppercase tracking-wider text-[10px]">Notice · </span>
                Changing your password signs out all other active sessions immediately.
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <div className="w-44">
                  <PrimaryButton type="submit" disabled={changePasswordMutation.isPending}>
                    {changePasswordMutation.isPending ? "Updating..." : "Update password"}
                  </PrimaryButton>
                </div>
              </div>
            </form>
          </Panel>

          <Panel title="Active sessions" subtitle="Session management API not yet exposed">
            <ul className="divide-y divide-border">
              {[
                { dev: "Current device", loc: "Detected from browser session", ip: "token-based", last: "now", current: true },
                { dev: "Other sessions", loc: "Unknown", ip: "Unknown", last: "—" },
              ].map((session, i) => (
                <li key={i} className="py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-foreground flex items-center gap-2">
                      {session.dev}
                      {session.current && (
                        <span className="text-[9.5px] uppercase tracking-wider px-1.5 h-4 inline-flex items-center bg-signal-green/15 text-signal-green border border-signal-green/30">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {session.loc} · {session.ip} · {session.last}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
