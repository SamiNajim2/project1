import { ConfigError, loadDotEnvLocal, readEnv } from "./config/env.js";
import { configureLogger, errorFields, log } from "./lib/logger.js";
import { createStore } from "./db/createStore.js";
import { MockJiraProvider } from "./jira/mock.js";
import { EventBus } from "./lib/eventBus.js";
import { MediaHub } from "./lib/mediaHub.js";
import { RecallClient } from "./recall/client.js";
import { ZenoAgent } from "./agent/claude.js";
import { MeetingOrchestrator } from "./agent/runtime.js";
import { ElevenLabsSynthesizer } from "./voice/elevenlabs.js";
import { createApp } from "./app.js";
import type { AppContext } from "./context.js";

loadDotEnvLocal();

let env;
try {
  env = readEnv();
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`\nZeno cannot start.\n\n${error.message}\n\n`);
    process.exit(1);
  }
  throw error;
}

configureLogger({ level: env.LOG_LEVEL, logTranscript: env.LOG_TRANSCRIPT });

const store = createStore(env.DATABASE_URL);
await store.init();

const provider = new MockJiraProvider(store);
const bus = new EventBus();
const media = new MediaHub();
const recall = new RecallClient(env.RECALL_API_KEY, env.RECALL_REGION);
const agent = new ZenoAgent(env.ANTHROPIC_API_KEY, env.LIVE_MODEL, env.REPORT_MODEL);
const synthesizer = new ElevenLabsSynthesizer(env.ELEVENLABS_API_KEY, env.ELEVENLABS_VOICE_ID);

const ctx: AppContext = {
  env,
  store,
  provider,
  agent,
  recall,
  synthesizer,
  bus,
  media,
  orchestrator: new MeetingOrchestrator({ store, provider, agent, recall, synthesizer, bus, media, env }),
  startedAt: Date.now(),
};

const app = createApp(ctx);
const server = app.listen(env.PORT, "0.0.0.0", () => {
  log.info("zeno started", {
    port: env.PORT,
    recallRegion: env.RECALL_REGION,
    appBaseUrl: env.APP_BASE_URL,
    liveModel: env.LIVE_MODEL,
    reportModel: env.REPORT_MODEL,
    store: env.DATABASE_URL.startsWith("memory:") ? "memory" : "postgres",
    webhookEndpoint: `${env.APP_BASE_URL}/api/webhooks/recall/status`,
    realtimeEndpoint: `${env.APP_BASE_URL}/api/webhooks/recall/realtime`,
  });
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    log.info("shutting down", { signal });
    server.close(() => {
      void store.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}

process.on("unhandledRejection", (reason) => log.error("unhandled rejection", errorFields(reason)));
