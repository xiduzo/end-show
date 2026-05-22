import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@end-show/env/server";

export type AssetKind = "portrait" | "work-image" | "work-video";

export type KeyInput = {
  userId: string;
  kind: AssetKind;
  assetId: string;
  mimeType: string;
};

export type PresignInput = {
  key: string;
  mimeType: string;
  bytes: number;
  expiresIn?: number;
};

export type PresignResult = {
  uploadUrl: string;
  expiresIn: number;
};

export interface AssetStore {
  isConfigured(): boolean;
  keyFor(input: KeyInput): string;
  presignPut(input: PresignInput): Promise<PresignResult>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

function defaultKeyFor(input: KeyInput): string {
  const ext = input.mimeType.split("/")[1] ?? "bin";
  return `students/${input.userId}/${input.kind}/${input.assetId}.${ext}`;
}

export class R2AssetStore implements AssetStore {
  private cached: S3Client | null = null;

  isConfigured(): boolean {
    return Boolean(
      env.R2_ACCOUNT_ID &&
        env.R2_BUCKET &&
        env.R2_ACCESS_KEY_ID &&
        env.R2_SECRET_ACCESS_KEY,
    );
  }

  keyFor(input: KeyInput): string {
    return defaultKeyFor(input);
  }

  async presignPut(input: PresignInput): Promise<PresignResult> {
    const expiresIn = input.expiresIn ?? 300;
    const command = new PutObjectCommand({
      Bucket: this.bucket(),
      Key: input.key,
      ContentType: input.mimeType,
    });
    const uploadUrl = await getSignedUrl(this.client(), command, { expiresIn });
    return { uploadUrl, expiresIn };
  }

  async delete(key: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.client().send(
        new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
      );
    } catch (e) {
      console.warn("[assetStore] r2 delete failed", e);
    }
  }

  publicUrl(key: string): string {
    if (env.R2_PUBLIC_URL) {
      return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
    }
    return `r2://${this.bucket()}/${key}`;
  }

  private client(): S3Client {
    if (this.cached) return this.cached;
    if (!this.isConfigured()) {
      throw new Error(
        "R2 not configured. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
      );
    }
    this.cached = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    return this.cached;
  }

  private bucket(): string {
    if (!env.R2_BUCKET) throw new Error("R2_BUCKET not set");
    return env.R2_BUCKET;
  }
}

export class InMemoryAssetStore implements AssetStore {
  public readonly puts = new Map<string, { mimeType: string; bytes: number }>();
  public readonly deletes: string[] = [];

  isConfigured(): boolean {
    return true;
  }

  keyFor(input: KeyInput): string {
    return defaultKeyFor(input);
  }

  async presignPut(input: PresignInput): Promise<PresignResult> {
    this.puts.set(input.key, { mimeType: input.mimeType, bytes: input.bytes });
    return {
      uploadUrl: `mem://upload/${encodeURIComponent(input.key)}`,
      expiresIn: input.expiresIn ?? 300,
    };
  }

  async delete(key: string): Promise<void> {
    this.deletes.push(key);
    this.puts.delete(key);
  }

  publicUrl(key: string): string {
    return `mem://asset/${key}`;
  }

  reset(): void {
    this.puts.clear();
    this.deletes.length = 0;
  }
}

let instance: AssetStore = new R2AssetStore();

export function getAssetStore(): AssetStore {
  return instance;
}

export function setAssetStore(impl: AssetStore): void {
  instance = impl;
}
