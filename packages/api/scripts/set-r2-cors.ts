import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@end-show/env/server";

if (
  !env.R2_ACCOUNT_ID ||
  !env.R2_BUCKET ||
  !env.R2_ACCESS_KEY_ID ||
  !env.R2_SECRET_ACCESS_KEY
) {
  throw new Error("R2_* env vars missing");
}

const allowedOrigins =
  process.env.R2_CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ??
  ["http://localhost:3001"];

const client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: env.R2_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: allowedOrigins,
          AllowedMethods: ["PUT", "GET", "HEAD"],
          AllowedHeaders: ["content-type", "content-length"],
          // GET/HEAD reads are served cross-origin to crossOrigin="anonymous"
          // <img>/<video> so the service worker can cache them cleanly.
          // Content-Range/Accept-Ranges let video range-requests cache too.
          ExposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

console.log(
  `CORS applied to bucket "${env.R2_BUCKET}" for origins:`,
  allowedOrigins,
);
