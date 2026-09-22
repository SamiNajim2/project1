import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a request from Recall.ai, per
 * https://docs.recall.ai/docs/authenticating-requests-from-recallai
 *
 * The same workspace verification secret covers dashboard webhooks (for workspaces
 * created on or after 2025-12-15), real-time endpoints and callbacks. The payload
 * must be the raw body exactly as received.
 */
export function verifyRequestFromRecall(args: {
  secret: string;
  headers: Record<string, string | undefined>;
  payload: string | Buffer | null;
}): void {
  const { secret, headers, payload } = args;
  const msgId = headers["webhook-id"] ?? headers["svix-id"];
  const msgTimestamp = headers["webhook-timestamp"] ?? headers["svix-timestamp"];
  const msgSignature = headers["webhook-signature"] ?? headers["svix-signature"];

  if (!secret || !secret.startsWith("whsec_")) {
    throw new VerificationError("verification secret is missing or invalid");
  }
  if (!msgId || !msgTimestamp || !msgSignature) {
    throw new VerificationError("missing webhook id, timestamp or signature header");
  }

  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const payloadStr = Buffer.isBuffer(payload) ? payload.toString("utf8") : (payload ?? "");
  const expected = createHmac("sha256", new Uint8Array(key))
    .update(`${msgId}.${msgTimestamp}.${payloadStr}`)
    .digest("base64");

  // Several signatures arrive for up to 24h after a secret rotation; any match passes.
  for (const versioned of msgSignature.split(" ")) {
    const [version, signature] = versioned.split(",");
    if (version !== "v1" || !signature) continue;
    const a = Buffer.from(expected, "base64");
    const b = Buffer.from(signature, "base64");
    if (a.length === b.length && timingSafeEqual(new Uint8Array(a), new Uint8Array(b))) return;
  }
  throw new VerificationError("no matching signature");
}

export class VerificationError extends Error {}
