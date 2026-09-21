import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

// Re-runs a request on Anthropic's recommended fallback model if a safety classifier declines it.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MissingKeyError();
  }
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export class MissingKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set on the server. Add it to .env.local (local) or the Vercel project settings (deployed).");
  }
}

export class StageError extends Error {}

/** Turns SDK and pipeline errors into a message that is safe and useful to show in the UI. */
export function describeError(error: unknown): string {
  if (error instanceof MissingKeyError || error instanceof StageError) return error.message;
  if (error instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.PermissionDeniedError) return "This API key does not have access to the requested model or tool.";
  if (error instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Wait a minute and retry this step.";
  if (error instanceof Anthropic.BadRequestError) return `The request was rejected by the Anthropic API: ${error.message}`;
  if (error instanceof Anthropic.InternalServerError) return "The Anthropic API had a temporary problem. Retry this step.";
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "The request to the Anthropic API timed out. Retry this step.";
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API. Check your network and retry.";
  if (error instanceof Anthropic.APIError) return `Anthropic API error ${error.status ?? ""}: ${error.message}`.trim();
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
