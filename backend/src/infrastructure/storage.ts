// Uploads on local disk under UPLOAD_DIR. The files table stores the relative path, so moving
// to other storage later is a change here only. Mime is sniffed from magic bytes, never trusted.
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FileKind } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { inTx, type Tx } from "./db.js";
import { fail } from "../middleware/errors.js";
import { FILE_POLICY, MB, type Mime, type UploadedFile } from "../middleware/upload.js";
import { getSetting } from "../modules/settings/settings.service.js";

const EXT: Record<Mime, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

export function sniff(head: Buffer): Mime | null {
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export type FileStore = {
  /** Validates the temp upload, copies it into storage and inserts the files row. `replaces` is the
   *  file it supersedes: that row is deleted here, its bytes once the transaction commits. */
  store(ownerUserId: string, kind: FileKind, f: UploadedFile | null, opts?: { replaces?: string | null }): Promise<{ id: string }>;
};

/**
 * The only way to write an upload: inTx, with the disk kept in step with the commit. Copies made
 * inside are removed if the transaction rolls back; superseded files are removed only after it commits,
 * so a rollback never loses a file that is still referenced. The copy happens before commit (not a
 * rename after it) because a post-commit failure would leave a row pointing at nothing, while a crash
 * here only leaves an unreferenced file.
 */
export async function inFileTx<T>(fn: (tx: Tx, files: FileStore) => Promise<T>): Promise<T> {
  const copied: string[] = [];
  const superseded: string[] = [];
  const rmAll = (rels: string[]) => Promise.all(rels.map((rel) => fs.rm(absolutePath(rel), { force: true })));
  let out: T;
  try {
    out = await inTx((tx) =>
      fn(tx, {
        async store(ownerUserId, kind, f, opts = {}) {
          const row = await storeFile(tx, ownerUserId, kind, f, copied);
          if (opts.replaces) {
            const old = await tx.file.findUnique({ where: { id: opts.replaces }, select: { storage_path: true } });
            if (old) {
              await tx.file.deleteMany({ where: { id: opts.replaces } });
              superseded.push(old.storage_path);
            }
          }
          return row;
        },
      }),
    );
  } catch (e) {
    await rmAll(copied);
    throw e;
  }
  await rmAll(superseded);
  return out;
}

async function storeFile(tx: Tx, ownerUserId: string, kind: FileKind, f: UploadedFile | null, copied: string[]) {
  if (!f) fail("VALIDATION_FAILED", { field: "file", reason: "missing" });
  const policy = FILE_POLICY[kind];
  const maxBytes = Math.min(Math.floor(((await getSetting("upload_max_mb"))[kind] ?? Infinity) * MB), policy.maxBytes);
  if (f.size > maxBytes) fail("FILE_TOO_LARGE", { maxBytes });
  const fh = await fs.open(f.path);
  const head = Buffer.alloc(8);
  await fh.read(head, 0, 8, 0);
  await fh.close();
  const mime = sniff(head);
  if (!mime || !policy.mimes.includes(mime)) fail("FILE_TYPE_NOT_ALLOWED", { allowed: policy.mimes });
  const rel = path.join(kind, `${randomUUID()}.${EXT[mime]}`);
  await fs.mkdir(path.dirname(absolutePath(rel)), { recursive: true });
  copied.push(rel);
  await fs.copyFile(f.path, absolutePath(rel));
  return tx.file.create({
    data: { owner_user_id: ownerUserId, kind, storage_path: rel, original_name: f.originalname.slice(0, 200), mime, size: f.size },
    select: { id: true },
  });
}

export const absolutePath = (storagePath: string) => path.join(env.UPLOAD_DIR, storagePath);
