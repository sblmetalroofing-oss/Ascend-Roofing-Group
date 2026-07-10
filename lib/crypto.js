// Field-level encryption for PII at rest (TFN, bank details).
//
// Activates when ENCRYPTION_KEY is set (64 hex chars — generate with
// `openssl rand -hex 32`). Before setting it, widen the DB columns: see the
// commented ALTER TABLE block at the bottom of schema.sql — AES-256-GCM
// ciphertext does not fit the original VARCHAR widths.
//
// Format: enc:v1:<iv b64>:<auth tag b64>:<ciphertext b64>
// decryptField() passes through values without the prefix, so legacy
// plaintext rows stay readable and are re-encrypted on their next upsert.
//
// Without ENCRYPTION_KEY both functions are identity — today's behaviour is
// preserved. maskTail() is always active regardless.

import crypto from "node:crypto";

const PREFIX = "enc:v1:";

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error("ENCRYPTION_KEY must be 64 hex characters (openssl rand -hex 32); storing plaintext.");
    return null;
  }
  return Buffer.from(hex, "hex");
}

export function encryptField(value) {
  if (value === null || value === undefined || value === "") return value;
  const key = getKey();
  if (!key) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptField(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) {
    throw new Error("Encrypted value present but ENCRYPTION_KEY is not set");
  }
  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/**
 * Mask all but the last `keep` characters: maskTail("12345678") → "•••••678".
 * Used so emails never carry full TFN/account numbers — the database record
 * is the authoritative copy.
 */
export function maskTail(value, keep = 3) {
  const str = String(value ?? "");
  if (!str) return "";
  if (str.length <= keep) return "•".repeat(str.length);
  return "•".repeat(str.length - keep) + str.slice(-keep);
}
