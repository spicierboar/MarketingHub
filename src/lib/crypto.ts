// Token encryption at rest (Phase 7, §31 "API keys, OAuth tokens and
// publishing credentials must be encrypted at rest").
//
// AES-256-GCM with a key derived from PUBLISHING_TOKEN_KEY. In production the
// key comes from the deployment secret store (and rotating it re-encrypts via
// a migration); the demo fallback key keeps the app runnable with zero
// external configuration but is clearly marked.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key(): Buffer {
  return createHash("sha256")
    .update(
      process.env.PUBLISHING_TOKEN_KEY ||
        "demo-only-key--set-PUBLISHING_TOKEN_KEY-in-production",
    )
    .digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(blob: string): string {
  const [ivB64, tagB64, encB64] = blob.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
