import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@end-show/env/server";

let cached: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_BUCKET &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY,
  );
}

export function getR2Client(): S3Client {
  if (cached) return cached;
  if (!isR2Configured()) {
    throw new Error(
      "R2 not configured. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }
  cached = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return cached;
}

export function getBucket(): string {
  if (!env.R2_BUCKET) throw new Error("R2_BUCKET not set");
  return env.R2_BUCKET;
}

export function publicUrlFor(r2Key: string): string {
  if (env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${r2Key}`;
  }
  return `r2://${getBucket()}/${r2Key}`;
}
