import { Button } from "@end-show/ui/components/button";
import { Input } from "@end-show/ui/components/input";
import { Label } from "@end-show/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

type Step = "request" | "verify";

export default function SignInForm() {
  const navigate = useNavigate({ from: "/" });
  const { isPending } = authClient.useSession();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");

  const requestForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: value.email,
        type: "sign-in",
      });
      if (error) {
        toast.error(error.message || "Could not send code");
        return;
      }
      setEmail(value.email);
      setStep("verify");
      toast.success("Code sent — check email (or server log in dev)");
    },
    validators: {
      onSubmit: z.object({ email: z.email("Invalid email address") }),
    },
  });

  const verifyForm = useForm({
    defaultValues: { otp: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.emailOtp({
        email,
        otp: value.otp,
      });
      if (error) {
        toast.error(error.message || "Invalid code");
        return;
      }
      toast.success("Signed in");
      navigate({ to: "/dashboard" });
    },
    validators: {
      onSubmit: z.object({ otp: z.string().length(6, "6-digit code") }),
    },
  });

  if (isPending) return <Loader />;

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">
        {step === "request" ? "Sign in" : "Enter code"}
      </h1>

      {step === "request" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            requestForm.handleSubmit();
          }}
          className="space-y-4"
        >
          <requestForm.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </requestForm.Field>
          <requestForm.Subscribe
            selector={(s) => ({
              canSubmit: s.canSubmit,
              isSubmitting: s.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Sending..." : "Send code"}
              </Button>
            )}
          </requestForm.Subscribe>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            verifyForm.handleSubmit();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            Sent to <span className="font-mono">{email}</span>
          </p>
          <verifyForm.Field name="otp">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>6-digit code</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) =>
                    field.handleChange(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </verifyForm.Field>
          <verifyForm.Subscribe
            selector={(s) => ({
              canSubmit: s.canSubmit,
              isSubmitting: s.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Verifying..." : "Verify"}
              </Button>
            )}
          </verifyForm.Subscribe>
          <div className="text-center">
            <Button
              variant="link"
              type="button"
              onClick={() => setStep("request")}
            >
              Use different email
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
