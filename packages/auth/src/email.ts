import { env } from "@end-show/env/server";

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

export async function sendStudentInviteEmail(args: {
  to: string;
  name: string;
}) {
  const host = getWebHost();
  const profileUrl = `${host}/profile`;
  const subject = "You are invited to the End Show!";
  const text = `Hi ${args.name},

Fill your profile via ${profileUrl}.

See you there.`;
  const html = `<p>Hi ${escapeHtml(args.name)},</p>
<p>You've been invited to the End Show. Sign in with your email at <a href="${host}/login">${host}/login</a> and fill in your profile here:</p>
<p><a href="${profileUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Fill in your profile</a></p>
<p>Or open: <a href="${profileUrl}">${profileUrl}</a></p>`;

  await sendEmail({ to: args.to, subject, text, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
