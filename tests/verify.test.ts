import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VerificationError, verifyRequestFromRecall } from "../src/server/recall/verify.js";

const SECRET = "whsec_" + Buffer.from("zeno-test-secret-value-000000000").toString("base64");

function sign(secret: string, id: string, timestamp: string, payload: string): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return createHmac("sha256", new Uint8Array(key)).update(`${id}.${timestamp}.${payload}`).digest("base64");
}

function headersFor(payload: string, secret = SECRET) {
  const id = "msg_test";
  const timestamp = "1790000000";
  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${sign(secret, id, timestamp, payload)}`,
  };
}

describe("verifyRequestFromRecall", () => {
  it("accepts a correctly signed payload", () => {
    const payload = JSON.stringify({ event: "transcript.data" });
    expect(() =>
      verifyRequestFromRecall({ secret: SECRET, headers: headersFor(payload), payload }),
    ).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const payload = JSON.stringify({ event: "transcript.data" });
    expect(() =>
      verifyRequestFromRecall({
        secret: SECRET,
        headers: headersFor(payload),
        payload: payload.replace("transcript", "chat"),
      }),
    ).toThrow(VerificationError);
  });

  it("rejects a signature made with another secret", () => {
    const payload = "{}";
    const other = "whsec_" + Buffer.from("another-secret-value-00000000000").toString("base64");
    expect(() =>
      verifyRequestFromRecall({ secret: SECRET, headers: headersFor(payload, other), payload }),
    ).toThrow(VerificationError);
  });

  it("rejects missing verification headers", () => {
    expect(() => verifyRequestFromRecall({ secret: SECRET, headers: {}, payload: "{}" })).toThrow(
      VerificationError,
    );
  });

  it("accepts svix-prefixed headers and multiple signatures after a rotation", () => {
    const payload = "{}";
    const id = "msg_rotate";
    const timestamp = "1790000000";
    const stale = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    expect(() =>
      verifyRequestFromRecall({
        secret: SECRET,
        headers: {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": `${stale} v1,${sign(SECRET, id, timestamp, payload)}`,
        },
        payload,
      }),
    ).not.toThrow();
  });

  it("verifies websocket upgrades, which carry no payload", () => {
    const id = "msg_ws";
    const timestamp = "1790000000";
    expect(() =>
      verifyRequestFromRecall({
        secret: SECRET,
        headers: {
          "webhook-id": id,
          "webhook-timestamp": timestamp,
          "webhook-signature": `v1,${sign(SECRET, id, timestamp, "")}`,
        },
        payload: null,
      }),
    ).not.toThrow();
  });
});
