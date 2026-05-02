import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthLink, AuthShell, Field, GhostButton, Input, PrimaryButton } from "@/components/clinical/auth-shell";
import { apiRequest } from "@/lib/api";
import { getAccessToken, setAuthTokens } from "@/lib/auth";
import type { TokenPairResponse } from "@/lib/types";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Laparoscopy Assistant" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (getAccessToken()) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await apiRequest<TokenPairResponse>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          }),
        },
        false,
      );
      setAuthTokens(response.access_token, response.refresh_token);
      toast.success("Signed in successfully.");
      void navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to your workstation"
      subtitle="Use your organization credentials. Sessions are bound to a 12-hour window."
      footer={
        <>
          New to the platform? <AuthLink to="/signup">Request an account</AuthLink>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email" required>
          <Input name="email" type="email" placeholder="surgeon@hospital.health" required autoComplete="email" />
        </Field>
        <Field label="Password" required hint={<span><AuthLink to="/forgot-password">Forgot?</AuthLink></span>}>
          <Input
            name="password"
            type="password"
            placeholder="••••••••••••"
            required
            minLength={8}
            autoComplete="current-password"
          />
        </Field>

        <label className="flex items-center gap-2 text-[12px] text-muted-foreground select-none cursor-pointer">
          <input type="checkbox" className="h-3.5 w-3.5 accent-signal-cyan" defaultChecked />
          Keep me signed in on this device
        </label>

        <div className="pt-2 space-y-3">
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </PrimaryButton>
          <GhostButton type="button" disabled>
            Sign in with SSO
          </GhostButton>
        </div>
      </form>
    </AuthShell>
  );
}
