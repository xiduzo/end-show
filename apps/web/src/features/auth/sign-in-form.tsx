import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { Loader } from "@/shell";

import { authClient } from "./auth-client";

type Step = "request" | "verify";

const OTP_TTL_SECONDS = 300;

export function SignInForm() {
  const navigate = useNavigate();
  const { isPending } = authClient.useSession();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");

  if (isPending) return <Loader />;

  return (
    <div className="bg-chalkboard text-lego-dark min-h-svh">
      <div className="mx-auto flex min-h-svh w-full max-w-xl flex-col px-6 pt-10 pb-8">
        <div className="flex flex-1 flex-col justify-center">
          {step === "request" ? (
            <RequestStep
              onSent={(value) => {
                setEmail(value);
                setStep("verify");
              }}
            />
          ) : (
            <VerifyStep
              email={email}
              onChangeEmail={() => setStep("request")}
              onVerified={(role) =>
                navigate({
                  to: role === "staff" ? "/admin/students" : "/profile",
                })
              }
            />
          )}
        </div>
        <KioskFooter step={step} />
      </div>
    </div>
  );
}

function RequestStep({ onSent }: { onSent: (email: string) => void }) {
  const form = useForm({
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
      onSent(value.email);
      toast.success("Code sent — check email (or server log in dev)");
    },
    validators: {
      onSubmit: z.object({ email: z.email("Invalid email address") }),
    },
  });

  return (
    <>
      <p className="text-lego-dark/60 font-mono text-xs tracking-[0.18em] uppercase">
        Master Digital Design
      </p>

      <div className="mt-3 flex items-start gap-3">
        <h1 className="font-display text-6xl leading-[0.95] font-bold tracking-tight">
          Sign in
        </h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="mt-10"
      >
        <form.Field name="email">
          {(field) => (
            <div>
              <label
                htmlFor={field.name}
                className="text-lego-dark/60 font-mono text-xs tracking-[0.2em] uppercase"
              >
                Email
              </label>
              <input
                id={field.name}
                name={field.name}
                type="email"
                autoFocus
                autoComplete="email"
                inputMode="email"
                placeholder="you@hva.nl"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="border-lego-dark bg-chalkboard text-lego-dark placeholder:text-lego-dark/30 focus-visible:ring-slide/40 mt-2 block w-full border-2 px-4 py-4 font-mono text-lg outline-none focus-visible:ring-4"
              />
              {field.state.meta.errors.map((error) => (
                <p
                  key={error?.message}
                  className="text-slide-dark mt-2 font-mono text-xs"
                >
                  {error?.message}
                </p>
              ))}
              <p className="text-lego-dark/55 mt-3 font-mono text-xs">
                only @hva.nl + invited addresses are accepted
              </p>
            </div>
          )}
        </form.Field>

        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="bg-lego-dark text-chalkboard hover:bg-lego active:bg-lego mt-8 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 font-mono text-base font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "sending…" : "send me a code →"}
            </button>
          )}
        </form.Subscribe>
      </form>
    </>
  );
}

function VerifyStep({
  email,
  onChangeEmail,
  onVerified,
}: {
  email: string;
  onChangeEmail: () => void;
  onVerified: (role: string | undefined) => void;
}) {
  const [remaining, setRemaining] = useState(OTP_TTL_SECONDS);
  const [resending, setResending] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [remaining]);

  const form = useForm({
    defaultValues: { otp: "" },
    onSubmit: async ({ value }) => {
      const { data, error } = await authClient.signIn.emailOtp({
        email,
        otp: value.otp,
      });
      if (error) {
        toast.error(error.message || "Invalid code");
        return;
      }
      toast.success("Signed in");
      onVerified((data?.user as { role?: string } | undefined)?.role);
    },
    validators: {
      onSubmit: z.object({ otp: z.string().length(6, "6-digit code") }),
    },
  });

  async function handleResend() {
    setResending(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setResending(false);
    if (error) {
      toast.error(error.message || "Could not resend code");
      return;
    }
    setRemaining(OTP_TTL_SECONDS);
    toast.success("New code sent");
  }

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const expired = remaining <= 0;

  return (
    <>
      <p className="text-lego-dark/60 font-mono text-xs tracking-[0.18em] uppercase">
        Step 2 / 2
      </p>
      <h1 className="font-display mt-3 text-5xl leading-[0.95] font-bold tracking-tight">
        Check your inbox
      </h1>
      <p className="text-lego-dark/70 mt-3 font-mono text-sm">
        We sent a 6-digit code to{" "}
        <span className="text-lego-dark font-bold">{email}</span>
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="mt-10"
      >
        <form.Field name="otp">
          {(field) => {
            const value = field.state.value;
            return (
              <div>
                <button
                  type="button"
                  onClick={() => hiddenInputRef.current?.focus()}
                  className="mx-auto flex w-full justify-center gap-2"
                  aria-label="Enter code"
                >
                  {Array.from({ length: 6 }).map((_, i) => {
                    const char = value[i] ?? "";
                    const active = i === value.length;
                    return (
                      <span
                        key={i}
                        className={
                          "border-lego-dark/80 bg-chalkboard flex h-14 w-12 items-center justify-center border-2 font-mono text-2xl font-bold transition-colors " +
                          (active
                            ? "border-slide ring-slide/30 ring-4"
                            : char
                              ? "border-lego-dark"
                              : "border-lego-dark/40")
                        }
                      >
                        {char || <span className="text-lego-dark/25">–</span>}
                      </span>
                    );
                  })}
                </button>
                <input
                  ref={hiddenInputRef}
                  id={field.name}
                  name={field.name}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={value}
                  onBlur={field.handleBlur}
                  onChange={(e) =>
                    field.handleChange(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  className="sr-only"
                />

                <p
                  className={
                    "mt-4 text-center font-mono text-sm " +
                    (expired ? "text-slide-dark" : "text-lego-dark/55")
                  }
                >
                  {expired
                    ? "code expired — resend below"
                    : `code expires in ${mm}:${ss.toString().padStart(2, "0")}`}
                </p>

                {field.state.meta.errors.map((error) => (
                  <p
                    key={error?.message}
                    className="text-slide-dark mt-2 text-center font-mono text-xs"
                  >
                    {error?.message}
                  </p>
                ))}
              </div>
            );
          }}
        </form.Field>

        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting || expired}
              className="bg-lego-dark text-chalkboard hover:bg-lego active:bg-lego mt-6 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 font-mono text-base font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "verifying…" : "verify →"}
            </button>
          )}
        </form.Subscribe>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending || (!expired && remaining > OTP_TTL_SECONDS - 30)}
          className="border-lego-dark/80 text-lego-dark hover:bg-lego-dark hover:text-chalkboard mt-3 flex w-full items-center justify-center rounded-full border-2 px-6 py-3.5 font-mono text-sm font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resending ? "sending…" : "resend code"}
        </button>
      </form>

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={onChangeEmail}
          className="text-lego-dark/70 hover:text-lego-dark font-mono text-sm"
        >
          ← wrong email?{" "}
          <span className="underline underline-offset-4">change it</span>
        </button>
      </div>
    </>
  );
}

function StickyNote({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "bg-crayon text-lego-dark relative max-w-[180px] px-4 py-3 shadow-[6px_6px_0_0_rgba(1,1,45,0.15)] " +
        (className ?? "")
      }
    >
      {children}
    </div>
  );
}

function KioskFooter({ step }: { step: Step }) {
  const navigate = useNavigate();
  return (
    <div className="mt-auto pt-12">
      <DottedRule />
      {step === "request" ? (
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="text-lego-dark/70 hover:text-lego-dark mt-4 w-full text-center font-mono text-sm"
        >
          not trying to sign in,{" "}
          <span className="bg-slime text-lego-dark px-1 font-bold">
            go back
          </span>
        </button>
      ) : (
        <p className="text-lego-dark/55 mt-4 text-center font-mono text-xs">
          a fresh code is good for {Math.floor(OTP_TTL_SECONDS / 60)} minutes.
        </p>
      )}
    </div>
  );
}

function DottedRule() {
  return (
    <div
      aria-hidden
      className="h-[3px] w-full"
      style={{
        backgroundImage:
          "radial-gradient(circle, currentColor 1px, transparent 1.5px)",
        backgroundSize: "10px 3px",
        backgroundRepeat: "repeat-x",
        color: "rgba(1,1,45,0.55)",
      }}
    />
  );
}
