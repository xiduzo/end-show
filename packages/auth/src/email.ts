import { env } from "@end-show/env/server";
import { render } from "emailmd";

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const { to, subject, text, html } = args;

  if (!env.RESEND_API_KEY) {
    console.log(`[email] to=${to} subject=${subject}\n${text}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
}

export function getWebHost(): string {
  const first = env.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return (first ?? env.BETTER_AUTH_URL).replace(/\/$/, "");
}

const THEME = {
  brandColor: "#3a39ff",
  headingColor: "#000000",
  bodyColor: "#000000",
  backgroundColor: "#f8f9fa",
  contentColor: "#ffffff",
  cardColor: "#f8f9fa",
  buttonColor: "#000000",
  buttonTextColor: "#ffffff",
  fontFamily: "Montserrat, Inter, system-ui, sans-serif",
  borderRadius: "6px",
} as const;

const FONTS = {
  Montserrat:
    "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap",
} as const;

const FORCE_LIGHT_META = `<meta name="color-scheme" content="only light"><meta name="supported-color-schemes" content="only light"><style>:root{color-scheme:only light;supported-color-schemes:only light}</style>`;

async function renderMd(markdown: string) {
  const result = await render(markdown, { theme: THEME, fonts: FONTS });
  const html = result.html.replace(
    /<head([^>]*)>/i,
    `<head$1>${FORCE_LIGHT_META}`,
  );
  return { html, text: result.text };
}

export async function sendStudentInviteEmail(args: {
  to: string;
  name: string;
}) {
  const host = getWebHost();
  const profileUrl = `${host}/profile`;
  const loginUrl = `${host}/login`;
  const subject = "You are invited to the Graduation Show!";

  const markdown = `---
preheader: "Fill in your profile for the Graduation Show"
---

# Hi ${args.name},

You've been invited to the **Graduation Show**.

Sign in with your email at [${loginUrl}](${loginUrl}) and fill in your profile so we can show you off.

[Fill in your profile](${profileUrl}){button}

Or open: [${profileUrl}](${profileUrl})

::: centered
See you there.
:::
`;

  const { html, text } = await renderMd(markdown);
  await sendEmail({ to: args.to, subject, text, html });
}

export async function sendStaffInviteEmail(args: { to: string; name: string }) {
  const host = getWebHost();
  const loginUrl = `${host}/login`;
  const adminUrl = `${host}/admin`;
  const subject = "You have been added as Graduation Show staff";

  const markdown = `---
preheader: "You have admin access to the Graduation Show"
---

# Hi ${args.name},

You have been added as **staff** for the Graduation Show.

Sign in with your email at [${loginUrl}](${loginUrl}) to access the admin panel.

[Open admin panel](${adminUrl}){button}

Or open: [${adminUrl}](${adminUrl})
`;

  const { html, text } = await renderMd(markdown);
  await sendEmail({ to: args.to, subject, text, html });
}

type OtpType = "sign-in" | "email-verification" | "forget-password";

const OTP_SUBJECTS: Record<OtpType, string> = {
  "sign-in": "Your sign-in code",
  "email-verification": "Verify your email",
  "forget-password": "Reset your password",
};

export async function sendOtpEmail(args: {
  email: string;
  otp: string;
  type: OtpType;
}) {
  const subject = OTP_SUBJECTS[args.type] ?? "Your verification code";

  const markdown = `---
preheader: "Your one-time code"
---

# Your code

::: highlight center
**${args.otp}**
:::

It expires in **10 minutes**.

If you didn't request this, ignore this email.
`;

  const { html, text } = await renderMd(markdown);
  await sendEmail({ to: args.email, subject, text, html });
}
