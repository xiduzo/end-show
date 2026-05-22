import { createDb } from "@end-show/db";
import * as schema from "@end-show/db/schema/auth";
import { env } from "@end-show/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: schema,
    }),
    trustedOrigins: env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
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
          // Dev transport: log to server stdout. Replace with real provider in deploy.
          console.log(`[auth][otp] type=${type} email=${email} otp=${otp}`);
        },
        otpLength: 6,
        expiresIn: 600,
        disableSignUp: false,
      }),
    ],
  });
}

export const auth = createAuth();
