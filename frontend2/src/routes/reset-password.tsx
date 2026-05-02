import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthLink, AuthShell, Field, Input, PrimaryButton } from "@/components/clinical/auth-shell";
import { apiRequest } from "@/lib/api";
import type { MessageResponse } from "@/lib/types";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — Laparoscopy Assistant" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [resetToken, setResetToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordChecks, setPasswordChecks] = useState({
    minLength: false,
    hasMixed: false,
    hasSymbol: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      setResetToken(token);
    }
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const token = String(form.get("reset_token") ?? "").trim();
    const password = String(form.get("new_password") ?? "");
    const confirmPassword = String(form.get("confirm_password") ?? "");

    if (!token) {
      toast.error("Reset token is required.");
      setIsSubmitting(false);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await apiRequest<MessageResponse>(
        "/auth/reset-password",
        {
          method: "POST",
          body: JSON.stringify({
            reset_token: token,
            new_password: password,
          }),
        },
        false,
      );
      toast.success(response.message);
      void navigate({ to: "/login" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password reset failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a passphrase you haven't used before on this platform."
      footer={<AuthLink to="/login">Back to sign in</AuthLink>}
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Reset token" hint="auto-filled from link">
          <Input
            name="reset_token"
            value={resetToken}
            onChange={(event) => setResetToken(event.target.value)}
            placeholder="Paste reset token"
            required
          />
        </Field>
        <Field label="New password" required>
          <Input
            name="new_password"
            type="password"
            placeholder="••••••••••••"
            required
            minLength={8}
            onChange={(event) => {
              const value = event.target.value;
              setPasswordChecks({
                minLength: value.length >= 8,
                hasMixed: /[a-z]/.test(value) && /\d/.test(value),
                hasSymbol: /[^A-Za-z0-9]/.test(value),
              });
            }}
          />
        </Field>
        <Field label="Confirm new password" required>
          <Input name="confirm_password" type="password" placeholder="••••••••••••" required minLength={8} />
        </Field>

        <ul className="text-[11.5px] text-muted-foreground space-y-1 pt-1">
          <Req ok={passwordChecks.minLength}>At least 8 characters</Req>
          <Req ok={passwordChecks.hasMixed}>Mix of letters and numbers</Req>
          <Req ok={passwordChecks.hasSymbol}>One symbol (! @ # $ %)</Req>
          <Req ok>Not used in last 5 passwords</Req>
        </ul>

        <div className="pt-2">
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating password..." : "Update password"}
          </PrimaryButton>
        </div>
      </form>
    </AuthShell>
  );
}

function Req({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-signal-green" : "bg-border-strong"}`} />
      <span className={ok ? "text-foreground" : ""}>{children}</span>
    </li>
  );
}
