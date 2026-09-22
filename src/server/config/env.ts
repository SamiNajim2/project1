import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Configuration is read from the process environment only. Secrets are never
 * logged, never sent to the browser and never written to the database.
 */
export interface Env {
  NODE_ENV: string;
  PORT: number;
  APP_BASE_URL: string;
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  LIVE_MODEL: string;
  REPORT_MODEL: string;
  RECALL_REGION: RecallRegion;
  RECALL_API_KEY: string;
  WEBHOOK_SECRET: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
  LOG_TRANSCRIPT: boolean;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
}

export const RECALL_REGIONS = [
  "us-west-2",
  "us-east-1",
  "eu-central-1",
  "ap-northeast-1",
] as const;
export type RecallRegion = (typeof RECALL_REGIONS)[number];

const REQUIRED = [
  "ANTHROPIC_API_KEY",
  "RECALL_API_KEY",
  "RECALL_REGION",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "APP_BASE_URL",
  "WEBHOOK_SECRET",
  "DATABASE_URL",
] as const;

/** Loads .env.local into process.env for local development. Railway injects real vars. */
export function loadDotEnvLocal(cwd = process.cwd()): void {
  for (const name of [".env.local", ".env"]) {
    const file = resolve(cwd, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match as unknown as [string, string, string];
      if (process.env[key] !== undefined) continue;
      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value !== "") process.env[key] = value;
    }
  }
}

export class ConfigError extends Error {}

function describeMissing(names: string[]): string {
  return [
    `Missing required environment variable${names.length > 1 ? "s" : ""}: ${names.join(", ")}.`,
    "",
    "Copy .env.example to .env.local and fill in the values (local), or set them on the",
    "Railway service (deployed). Never commit real values: .gitignore ignores every .env* file.",
  ].join("\n");
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const missing = REQUIRED.filter((name) => !source[name]?.trim());
  if (missing.length > 0) throw new ConfigError(describeMissing(missing));

  const region = source.RECALL_REGION!.trim();
  if (!(RECALL_REGIONS as readonly string[]).includes(region)) {
    throw new ConfigError(
      `RECALL_REGION must be one of ${RECALL_REGIONS.join(", ")} (got "${region}"). ` +
        "The API key, verification secret, webhooks and bots must all live in the same region.",
    );
  }

  const secret = source.WEBHOOK_SECRET!.trim();
  if (!secret.startsWith("whsec_")) {
    throw new ConfigError(
      'WEBHOOK_SECRET must be the Recall workspace verification secret and start with "whsec_". ' +
        "Create one in the Recall dashboard under Developers > API Keys & Secrets.",
    );
  }

  const baseUrl = source.APP_BASE_URL!.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ConfigError(`APP_BASE_URL is not a valid URL: "${baseUrl}"`);
  }
  if (parsed.protocol !== "https:") {
    throw new ConfigError(
      `APP_BASE_URL must be an https URL Recall can reach (got "${baseUrl}"). ` +
        "Locally, use a static ngrok URL: https://docs.recall.ai/docs/local-webhook-development",
    );
  }
  if (isLocalHostname(parsed.hostname)) {
    throw new ConfigError(
      `APP_BASE_URL must not be localhost or an IP address (got "${parsed.hostname}"). ` +
        "Recall rejects those request bodies with HTTP 403.",
    );
  }

  const level = (source.LOG_LEVEL ?? "info").trim() as Env["LOG_LEVEL"];

  return {
    NODE_ENV: source.NODE_ENV ?? "development",
    PORT: Number(source.PORT ?? 8080),
    APP_BASE_URL: baseUrl,
    DATABASE_URL: source.DATABASE_URL!.trim(),
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY!.trim(),
    LIVE_MODEL: (source.ZENO_LIVE_MODEL ?? "claude-sonnet-5").trim(),
    REPORT_MODEL: (source.ZENO_REPORT_MODEL ?? "claude-opus-5").trim(),
    RECALL_REGION: region as RecallRegion,
    RECALL_API_KEY: source.RECALL_API_KEY!.trim(),
    WEBHOOK_SECRET: secret,
    ELEVENLABS_API_KEY: source.ELEVENLABS_API_KEY!.trim(),
    ELEVENLABS_VOICE_ID: source.ELEVENLABS_VOICE_ID!.trim(),
    LOG_TRANSCRIPT: (source.LOG_TRANSCRIPT ?? "false").trim() === "true",
    LOG_LEVEL: ["debug", "info", "warn", "error"].includes(level) ? level : "info",
  };
}

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":")
  );
}

export function recallApiBase(region: RecallRegion): string {
  return `https://${region}.recall.ai/api/v1`;
}
