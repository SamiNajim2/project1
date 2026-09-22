import type { Env } from "./config/env.js";
import type { Store } from "./db/store.js";
import type { JiraProvider } from "./jira/provider.js";
import type { EventBus } from "./lib/eventBus.js";
import type { MediaHub } from "./lib/mediaHub.js";
import type { RecallClient } from "./recall/client.js";
import type { MeetingOrchestrator } from "./agent/runtime.js";
import type { ZenoAgent } from "./agent/claude.js";
import type { SpeechSynthesizer } from "./voice/elevenlabs.js";

/** Everything the HTTP layer needs. Assembled once in index.ts, injected in tests. */
export interface AppContext {
  env: Env;
  store: Store;
  provider: JiraProvider;
  agent: ZenoAgent;
  recall: RecallClient;
  synthesizer: SpeechSynthesizer;
  bus: EventBus;
  media: MediaHub;
  orchestrator: MeetingOrchestrator;
  startedAt: number;
}
