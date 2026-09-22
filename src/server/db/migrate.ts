import { loadDotEnvLocal, readEnv } from "../config/env.js";
import { log } from "../lib/logger.js";
import { createStore } from "./createStore.js";

/** `npm run migrate` — creates the schema and seeds the mock Jira workspace. */
loadDotEnvLocal();
const env = readEnv();
const store = createStore(env.DATABASE_URL);
await store.init();
log.info("schema ready", { store: env.DATABASE_URL.startsWith("memory:") ? "memory" : "postgres" });
await store.close();
