import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed tokens for the Output Media webpage. The bot loads that page
 * over the public internet, so the URL carries a token instead of being public.
 */
export function createMediaToken(args: {
  secret: string;
  meetingId: string;
  ttlMs: number;
  now?: number;
}): string {
  const expires = (args.now ?? Date.now()) + args.ttlMs;
  const payload = `${args.meetingId}.${expires}`;
  return `${base64url(payload)}.${sign(args.secret, payload)}`;
}

export function verifyMediaToken(args: {
  secret: string;
  token: string;
  now?: number;
}): { meetingId: string; expires: number } | null {
  const parts = args.token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts as [string, string];
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(args.secret, payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(new Uint8Array(a), new Uint8Array(b))) return null;
  const [meetingId, rawExpires] = payload.split(".") as [string, string];
  const expires = Number(rawExpires);
  if (!Number.isFinite(expires) || expires < (args.now ?? Date.now())) return null;
  return { meetingId, expires };
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", `zeno-media:${secret}`).update(payload).digest("base64url");
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
