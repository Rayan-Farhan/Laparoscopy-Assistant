import { FormEvent, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthLink, AuthShell, Field, Input, PrimaryButton } from "@/components/clinical/auth-shell";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Laparoscopy Assistant" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await apiRequest<{ message: string; reset_token?: string }>(
        "/auth/forgot-password",
        {
          method: "POST",
          body: JSON.stringify({ email: String(form.get("email") ?? "") }),
        },
        false,
      );
      setDevResetToken(response.reset_token ?? null);
      toast.success(response.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start password reset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll send a single-use link to your verified work email. Links expire in 30 minutes."
      footer={
        <>
          Remembered it? <AuthLink to="/login">Back to sign in</AuthLink>
        </>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        <Field label="Work email" required>
          <Input name="email" type="email" placeholder="you@hospital.health" required />
        </Field>

        <PrimaryButton type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send reset link"}
        </PrimaryButton>
      </form>
      {devResetToken && (
        <div className="mt-4 border border-signal-amber/30 bg-signal-amber/10 p-3 text-[11px] font-mono break-all">
          Development reset token: {devResetToken}
        </div>
      )}
    </AuthShell>
  );
}
