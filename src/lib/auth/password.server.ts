/**
 * CEN-MB-01 — Băm mật khẩu bằng scrypt (Node crypto, không phụ thuộc dịch vụ ngoài).
 * Định dạng lưu: scrypt$N$r$p$salt_b64$hash_b64 — không bao giờ lưu mật khẩu thô.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      expected.length,
      { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) },
      (error, out) => (error ? reject(error) : resolve(out)),
    );
  }).catch(() => null);

  if (!key || key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}