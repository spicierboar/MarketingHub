// Object storage adapter for real-media DAM (asset bytes).
//
// Env-gated, mirroring the DB/publishing pattern:
//   • SUPABASE_MEDIA_BUCKET + a configured service-role client → Supabase Storage
//     (production; the batched end-wiring — never exercised without creds).
//   • CC_MEDIA_DIR set → a local-disk dev backend (testable now, zero accounts).
//   • neither → storage is OFF; uploads are refused and the app runs
//     metadata-only exactly as before.
//
// Bytes NEVER enter the JSON store — only a StoredFileRef (key + checksum) does,
// so persistence snapshots stay small. Object keys are built from our own ids
// (tenant/company/asset) and charset-validated so a key can never traverse out
// of the media root.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { getServiceSupabase } from "@/lib/db/supabase";
import type { StoredFileRef } from "@/lib/types";

const MEDIA_DIR = process.env.CC_MEDIA_DIR?.trim() || undefined;
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET?.trim() || undefined;

export const MAX_MEDIA_BYTES =
  Math.max(1, Number(process.env.CC_MEDIA_MAX_MB) || 25) * 1024 * 1024;

export type StorageMode = "supabase" | "disk" | "off";

export function storageMode(): StorageMode {
  if (BUCKET && getServiceSupabase()) return "supabase";
  if (MEDIA_DIR) return "disk";
  return "off";
}
export function storageConfigured(): boolean {
  return storageMode() !== "off";
}

// Keys are our own ids joined with "/" — validate defensively so a crafted key
// can never escape the media root (path traversal) or hit an absolute path.
function safeKey(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key) || key.includes("..")) {
    throw new Error("Invalid storage key");
  }
  return key;
}

export function mediaKey(tenantId: string, companyId: string, assetId: string): string {
  return safeKey(`${tenantId}/${companyId}/${assetId}`);
}

export async function putObject(
  key: string,
  bytes: Buffer,
  mimeType: string,
): Promise<StoredFileRef> {
  safeKey(key);
  const ref: StoredFileRef = {
    key,
    sizeBytes: bytes.length,
    mimeType,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
  const mode = storageMode();
  if (mode === "supabase") {
    try {
      const { error } = await getServiceSupabase()!
        .storage.from(BUCKET!)
        .upload(key, bytes, { contentType: mimeType, upsert: true });
      if (error) throw error;
    } catch (err) {
      console.error("[storage] supabase upload failed:", err);
      throw new Error("Media upload failed (see server logs).");
    }
    return ref;
  }
  if (mode === "disk") {
    const path = join(MEDIA_DIR!, key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return ref;
  }
  throw new Error("Media storage is not configured.");
}

export async function getObject(key: string): Promise<Buffer | null> {
  safeKey(key);
  const mode = storageMode();
  if (mode === "supabase") {
    try {
      const { data, error } = await getServiceSupabase()!
        .storage.from(BUCKET!)
        .download(key);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    } catch (err) {
      console.error("[storage] supabase download failed:", err);
      return null;
    }
  }
  if (mode === "disk") {
    const path = join(MEDIA_DIR!, key);
    try {
      return existsSync(path) ? readFileSync(path) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function deleteObject(key: string): Promise<void> {
  safeKey(key);
  const mode = storageMode();
  if (mode === "supabase") {
    await getServiceSupabase()!.storage.from(BUCKET!).remove([key]).catch(() => {});
  } else if (mode === "disk") {
    try {
      rmSync(join(MEDIA_DIR!, key), { force: true });
    } catch {
      /* best-effort */
    }
  }
}

// Erase every object under a tenant prefix (GDPR tenant deletion). Disk removes
// the whole namespace directory; Supabase walks its two-level layout.
export async function deleteTenantMedia(tenantId: string): Promise<void> {
  safeKey(tenantId);
  const mode = storageMode();
  if (mode === "disk") {
    try {
      rmSync(join(MEDIA_DIR!, tenantId), { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
    return;
  }
  if (mode === "supabase") {
    const sb = getServiceSupabase()!;
    // GDPR erasure MUST be complete — page through every level (list() caps at
    // its limit and needs offset paging) and chunk the removes.
    const listAll = async (prefix: string): Promise<string[]> => {
      const names: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data } = await sb.storage.from(BUCKET!).list(prefix, { limit: 1000, offset });
        if (!data || data.length === 0) break;
        names.push(...data.map((f) => f.name));
        if (data.length < 1000) break;
      }
      return names;
    };
    try {
      const keys: string[] = [];
      for (const company of await listAll(tenantId)) {
        for (const file of await listAll(`${tenantId}/${company}`)) {
          keys.push(`${tenantId}/${company}/${file}`);
        }
      }
      for (let i = 0; i < keys.length; i += 1000) {
        await sb.storage.from(BUCKET!).remove(keys.slice(i, i + 1000));
      }
    } catch (err) {
      console.error("[storage] tenant media purge failed:", err);
    }
  }
}
