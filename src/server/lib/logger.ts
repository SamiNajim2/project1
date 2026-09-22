/**
 * Structured JSON logging. Transcript text and message bodies are omitted unless
 * LOG_TRANSCRIPT=true, and secrets are never passed to the logger.
 */
type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: Level = "info";
let logTranscript = false;

export function configureLogger(options: { level?: Level; logTranscript?: boolean }): void {
  if (options.level) minLevel = options.level;
  if (options.logTranscript !== undefined) logTranscript = options.logTranscript;
}

export type LogFields = Record<string, unknown>;

function emit(level: Level, message: string, fields: LogFields = {}): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...redact(fields),
  });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

const SENSITIVE = /(api[_-]?key|secret|token|authorization|password|xi-api-key)/i;

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE.test(key)) out[key] = "[redacted]";
    else if (key === "text" || key === "transcript" || key === "message") {
      out[key] = logTranscript ? value : `[${String(value ?? "").length} chars]`;
    } else out[key] = value;
  }
  return out;
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};

export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return { error: error.message, errorName: error.name };
  }
  return { error: String(error) };
}
