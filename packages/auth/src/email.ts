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

export async function sendStudentFlaggedEmail(args: {
  to: string;
  name: string;
  reason: string;
}) {
  const host = getWebHost();
  const profileUrl = `${host}/profile`;
  const subject = "Your Graduation Show profile has been flagged";

  const markdown = `---
preheader: "Your Graduation Show profile is currently hidden"
---

# Hi ${args.name},

A staff member has **flagged** your Graduation Show profile, so it is no longer shown.

::: highlight
${args.reason}
:::

Please review your profile and address the issue above.

[Open your profile](${profileUrl}){button}

Or open: [${profileUrl}](${profileUrl})
`;

  const { html, text } = await renderMd(markdown);
  await sendEmail({ to: args.to, subject, text, html });
}

export async function sendReviewRequestEmail(args: {
  to: string;
  staffName: string;
  studentName: string;
  studentUserId: string;
  reason: string;
  message: string;
}) {
  const host = getWebHost();
  const reviewUrl = `${host}/admin/students/${args.studentUserId}`;
  const subject = `${args.studentName} requested a re-review of their flagged profile`;

  const note = args.message
    ? `They added a note:

::: highlight
${args.message}
:::
`
    : "They did not add a note.";

  const markdown = `---
preheader: "A flagged student wants their profile re-reviewed"
---

# Hi ${args.staffName},

**${args.studentName}** has fixed their profile and is asking you to re-review it.

You flagged them for:

::: highlight
${args.reason}
:::

${note}

Open their profile to **accept** (restore & show) or **deny** (keep hidden) the request. Either way they will be emailed.

[Review ${args.studentName}](${reviewUrl}){button}

Or open: [${reviewUrl}](${reviewUrl})
`;

  const { html, text } = await renderMd(markdown);
  await sendEmail({ to: args.to, subject, text, html });
}

export async function sendReviewAcceptedEmail(args: { to: string; name: string }) {
  const host = getWebHost();
  const profileUrl = `${host}/profile`;
  const subject = "Your Graduation Show profile is back online";

  const markdown = `---
preheader: "Your re-review request was accepted"
---

# Hi ${args.name},

Good news — a staff member **accepted** your re-review request. Your profile is no longer flagged and is shown again in the Graduation Show.

[Open your profile](${profileUrl}){button}

Or open: [${profileUrl}](${profileUrl})
`;

  const { html, text } = await renderMd(markdown);
  await sendEmail({ to: args.to, subject, text, html });
}

export async function sendReviewDeniedEmail(args: {
  to: string;
  name: string;
  reason: string;
}) {
  const host = getWebHost();
  const profileUrl = `${host}/profile`;
  const subject = "Your re-review request was not accepted";

  const markdown = `---
preheader: "Your profile is still flagged"
---

# Hi ${args.name},

A staff member reviewed your request and **kept your profile flagged**, so it stays hidden.

::: highlight
${args.reason}
:::

Please reach out to a staff member directly if you need more detail.

[Open your profile](${profileUrl}){button}

Or open: [${profileUrl}](${profileUrl})
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
