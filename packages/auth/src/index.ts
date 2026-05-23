import { createDb } from "@end-show/db";
import * as schema from "@end-show/db/schema/auth";
import { env } from "@end-show/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";

import { sendEmail } from "./email";

type OtpType = "sign-in" | "email-verification" | "forget-password";

const SUBJECTS: Record<OtpType, string> = {
  "sign-in": "Your sign-in code",
  "email-verification": "Verify your email",
  "forget-password": "Reset your password",
};

async function sendOtpEmail(args: {
  email: string;
  otp: string;
  type: OtpType;
}) {
  const { email, otp, type } = args;
  const subject = SUBJECTS[type] ?? "Your verification code";
  const text = `Your code is ${otp}. It expires in 10 minutes.`;
  const html = `<p>Your code is <strong style="font-size:18px;letter-spacing:2px">${otp}</strong>.</p><p>It expires in 10 minutes.</p>`;
  await sendEmail({ to: email, subject, text, html });
}

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: schema,
    }),
    trustedOrigins: env.CORS_ORIGIN.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "student",
          input: false,
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
        secure: env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          // Dev transport: log to server stdout.
          console.log(`[auth][otp] type=${type} email=${email} otp=${otp}`);

          await sendOtpEmail({ email, otp, type: type as OtpType });
        },
        otpLength: 6,
        expiresIn: 600,
        disableSignUp: true,
      }),
    ],
  });
}

export const auth = createAuth();
