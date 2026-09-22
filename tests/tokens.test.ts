import { describe, expect, it } from "vitest";
import { createMediaToken, verifyMediaToken } from "../src/server/lib/tokens.js";

const SECRET = "whsec_testsecret";

describe("media page tokens", () => {
  it("round-trips the meeting id", () => {
    const token = createMediaToken({ secret: SECRET, meetingId: "meeting-1", ttlMs: 60_000 });
    expect(verifyMediaToken({ secret: SECRET, token })?.meetingId).toBe("meeting-1");
  });

  it("rejects an expired token", () => {
    const token = createMediaToken({ secret: SECRET, meetingId: "meeting-1", ttlMs: 1000, now: 0 });
    expect(verifyMediaToken({ secret: SECRET, token, now: 2000 })).toBeNull();
  });

  it("rejects a token signed with another secret or tampered with", () => {
    const token = createMediaToken({ secret: "whsec_other", meetingId: "meeting-1", ttlMs: 60_000 });
    expect(verifyMediaToken({ secret: SECRET, token })).toBeNull();
    const good = createMediaToken({ secret: SECRET, meetingId: "meeting-1", ttlMs: 60_000 });
    expect(verifyMediaToken({ secret: SECRET, token: good.replace(/.$/, "x") })).toBeNull();
    expect(verifyMediaToken({ secret: SECRET, token: "garbage" })).toBeNull();
  });
});
