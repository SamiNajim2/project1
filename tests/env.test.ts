import { describe, expect, it } from "vitest";
import { ConfigError, readEnv, recallApiBase } from "../src/server/config/env.js";

const VALID = {
  ANTHROPIC_API_KEY: "sk-ant-test",
  RECALL_API_KEY: "recall-test",
  RECALL_REGION: "ap-northeast-1",
  ELEVENLABS_API_KEY: "eleven-test",
  ELEVENLABS_VOICE_ID: "voice-test",
  APP_BASE_URL: "https://zeno.example.com",
  WEBHOOK_SECRET: "whsec_abc",
  DATABASE_URL: "memory:",
};

describe("startup configuration", () => {
  it("accepts a complete configuration and normalises the base URL", () => {
    const env = readEnv({ ...VALID, APP_BASE_URL: "https://zeno.example.com/" });
    expect(env.APP_BASE_URL).toBe("https://zeno.example.com");
    expect(env.RECALL_REGION).toBe("ap-northeast-1");
    expect(env.LIVE_MODEL).toBe("claude-sonnet-5");
  });

  it("names every missing variable", () => {
    const { ANTHROPIC_API_KEY: _key, WEBHOOK_SECRET: _secret, ...rest } = VALID;
    expect(() => readEnv(rest)).toThrow(ConfigError);
    try {
      readEnv(rest);
    } catch (error) {
      expect((error as Error).message).toContain("ANTHROPIC_API_KEY");
      expect((error as Error).message).toContain("WEBHOOK_SECRET");
    }
  });

  it("rejects an unknown Recall region", () => {
    expect(() => readEnv({ ...VALID, RECALL_REGION: "ap-southeast-2" })).toThrow(/RECALL_REGION must be one of/);
  });

  it("rejects a verification secret that is not a whsec_ secret", () => {
    expect(() => readEnv({ ...VALID, WEBHOOK_SECRET: "supersecret" })).toThrow(/whsec_/);
  });

  it("rejects a base URL Recall cannot reach", () => {
    expect(() => readEnv({ ...VALID, APP_BASE_URL: "http://zeno.example.com" })).toThrow(/https/);
    expect(() => readEnv({ ...VALID, APP_BASE_URL: "https://localhost:8080" })).toThrow(/localhost or an IP/);
    expect(() => readEnv({ ...VALID, APP_BASE_URL: "https://127.0.0.1:8080" })).toThrow(/localhost or an IP/);
  });

  it("builds the regional API base", () => {
    expect(recallApiBase("ap-northeast-1")).toBe("https://ap-northeast-1.recall.ai/api/v1");
  });
});
