/**
 * Turning what people say and type into commands for Zeno.
 *
 * Text mode: a chat message that starts with `/zeno` or `zeno:`.
 * Voice mode: the wake phrase "Zeno" at the START of a finalized utterance only,
 * so mid-sentence mentions ("we should ask Zeno later") never trigger an answer.
 */

export type ParsedCommand =
  | { kind: "question"; question: string }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "none" };

const WAKE = /^\s*(?:hey\s+|ok\s+|okay\s+)?zeno\b[\s,.:;!?-]*/i;
const CHAT_PREFIX = /^\s*(?:\/zeno\b|zeno\s*:)[\s,.:;!?-]*/i;
const CONFIRM = /^(?:confirm|confirmed|yes,?\s*confirm|do it|go ahead|approve[d]?)\.?$/i;
const CANCEL = /^(?:cancel|cancelled|no,?\s*cancel|stop|nevermind|never mind|abort|reject)\.?$/i;

/** Teams delivers formatted chat messages as HTML. */
export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function parseChatCommand(rawText: string): ParsedCommand {
  const text = stripHtml(rawText);
  if (!text) return { kind: "none" };

  const prefixed = CHAT_PREFIX.test(text);
  const body = prefixed ? text.replace(CHAT_PREFIX, "").trim() : text.trim();

  // A bare "confirm" / "cancel" answers a pending approval without the prefix.
  if (CONFIRM.test(body)) return { kind: "confirm" };
  if (CANCEL.test(body)) return { kind: "cancel" };
  if (!prefixed) return { kind: "none" };
  if (!body) return { kind: "none" };
  return { kind: "question", question: body };
}

/** Only finalized utterances should reach this; partials never trigger Zeno. */
export function parseVoiceCommand(rawText: string): ParsedCommand {
  const text = rawText.trim();
  if (!text || !WAKE.test(text)) return { kind: "none" };
  const body = text.replace(WAKE, "").trim();
  if (CONFIRM.test(body)) return { kind: "confirm" };
  if (CANCEL.test(body)) return { kind: "cancel" };
  if (body.length < 2) return { kind: "none" };
  return { kind: "question", question: body };
}

export function normalizeForDedupe(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Suppresses repeats of the same utterance (Recall can redeliver, and speech
 * recognition often finalizes the same sentence twice) within `windowMs`.
 */
export class Deduper {
  private readonly seen = new Map<string, number>();

  constructor(private readonly windowMs = 20_000) {}

  isDuplicate(key: string, now = Date.now()): boolean {
    for (const [existing, at] of this.seen) {
      if (now - at > this.windowMs) this.seen.delete(existing);
    }
    const previous = this.seen.get(key);
    this.seen.set(key, now);
    return previous !== undefined && now - previous <= this.windowMs;
  }
}

/** Keeps Zeno from talking over itself: one spoken answer at a time, then a pause. */
export class Cooldown {
  private readyAt = 0;

  constructor(private readonly gapMs = 8000) {}

  ready(now = Date.now()): boolean {
    return now >= this.readyAt;
  }

  remainingMs(now = Date.now()): number {
    return Math.max(0, this.readyAt - now);
  }

  start(durationMs = 0, now = Date.now()): void {
    this.readyAt = now + durationMs + this.gapMs;
  }
}

/** ~2.6 words per second of speech; used to keep spoken answers under 25 seconds. */
export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / 2.6;
}

export const MAX_SPOKEN_SECONDS = 25;
export const MAX_SPOKEN_WORDS = Math.floor(MAX_SPOKEN_SECONDS * 2.6);

/** Trims a spoken answer to whole sentences that fit inside the spoken budget. */
export function fitSpokenAnswer(text: string, maxWords = MAX_SPOKEN_WORDS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.split(/\s+/).length <= maxWords) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]?/g) ?? [clean];
  const kept: string[] = [];
  let count = 0;
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).length;
    if (count + words > maxWords) break;
    kept.push(sentence.trim());
    count += words;
  }
  if (kept.length === 0) return clean.split(/\s+/).slice(0, maxWords).join(" ") + "…";
  return kept.join(" ");
}
