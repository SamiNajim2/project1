import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
// Re-runs a request on Anthropic's recommended fallback model if a safety classifier declines it.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Wait a minute and try again.";
  if (error instanceof Anthropic.BadRequestError) return `The request was rejected by the Anthropic API: ${error.message}`;
  if (error instanceof Anthropic.InternalServerError) return "The Anthropic API had a temporary problem. Try again.";
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API.";
  if (error instanceof Anthropic.APIError) return `Anthropic API error ${error.status ?? ""}: ${error.message}`.trim();
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
