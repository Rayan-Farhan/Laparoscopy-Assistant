import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthLink, AuthShell, Field, Input, PrimaryButton, Select } from "@/components/clinical/auth-shell";
import { apiRequest } from "@/lib/api";
import { getAccessToken, setAuthTokens } from "@/lib/auth";
import type { TokenPairResponse, UserRole } from "@/lib/types";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — Laparoscopy Assistant" }] }),
  component: SignupPage,
});

function SignupPage() {
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
        "/auth/signup",
        {
          method: "POST",
          body: JSON.stringify({
            full_name: String(form.get("full_name") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
            role: String(form.get("role") ?? "doctor") as UserRole,
            organization_name: String(form.get("organization_name") ?? ""),
          }),
        },
        false,
      );
      setAuthTokens(response.access_token, response.refresh_token);
      toast.success("Account created.");
      void navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account creation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Accounts are scoped to a single organization. Admin approval required for clinical roles."
      footer={
        <>
          Already provisioned? <AuthLink to="/login">Sign in</AuthLink>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Full name" required>
          <Input name="full_name" placeholder="Dr. Anika Patel" required minLength={2} />
        </Field>
        <Field label="Work email" required>
          <Input name="email" type="email" placeholder="you@hospital.health" required autoComplete="email" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role" required>
            <Select name="role" defaultValue="surgeon">
              <option value="surgeon">Surgeon</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Organization" required>
            <Input name="organization_name" placeholder="St. Stephen's Surgical" required />
          </Field>
        </div>
        <Field label="Password" required hint="min 8 chars">
          <Input
            name="password"
            type="password"
            placeholder="••••••••••••"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>

        <PasswordStrength />

        <label className="flex items-start gap-2 text-[11.5px] text-muted-foreground leading-relaxed cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-signal-cyan" required />
          <span>
            I confirm I am authorized to upload de-identified surgical recordings under the organization's BAA, and
            accept the <AuthLink to="/login">Acceptable Use Policy</AuthLink>.
          </span>
        </label>

        <div className="pt-2">
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </PrimaryButton>
        </div>
      </form>
    </AuthShell>
  );
}

function PasswordStrength() {
  const segments = [
    { label: "weak", color: "bg-signal-red" },
    { label: "okay", color: "bg-signal-amber" },
    { label: "strong", color: "bg-signal-green" },
    { label: "ideal", color: "bg-signal-green" },
  ];
  const filled = 3;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {segments.map((s, i) => (
          <div key={i} className={`h-[3px] flex-1 ${i < filled ? s.color : "bg-border"}`} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        <span>strength</span>
        <span className="text-signal-green">strong</span>
      </div>
    </div>
  );
}
