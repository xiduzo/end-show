import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    LIBSQL_AUTH_TOKEN: z.string().min(1).optional(),
    MIGRATIONS_DIR: z.string().min(1).default("./migrations"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z
      .string()
      .min(1)
      .refine(
        (v) =>
          v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .every((u) => z.url().safeParse(u).success),
        { message: "CORS_ORIGIN must be a comma-separated list of URLs" },
      ),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_PUBLIC_URL: z.url().optional(),
    // Custom S3-compatible endpoint (RustFS/MinIO/Garage). When set, overrides
    // the Cloudflare R2 endpoint. Self-hosted backends need path-style addressing.
    R2_ENDPOINT: z.url().optional(),
    R2_FORCE_PATH_STYLE: z.coerce.boolean().optional(),
    BUDGET_DEFAULT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 1024 * 1024),
    BUDGET_TRANSFER_FLOOR_BYTES: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(5 * 1024 * 1024),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM: z
      .string()
      .min(1)
      .default("Graduation Show <onboarding@resend.dev>"),
    ROOT_STAFF_EMAIL: z.email().default("mail@sanderboer.nl"),
    ROOT_STAFF_NAME: z.string().trim().min(1).default("Sander Boer"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
