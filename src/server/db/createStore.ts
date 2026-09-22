import { loadJiraSeed } from "./seedData.js";
import { MemoryStore } from "./memory.js";
import { PostgresStore } from "./postgres.js";
import { isMemoryUrl, type Store } from "./store.js";

export function createStore(databaseUrl: string): Store {
  const seed = loadJiraSeed();
  return isMemoryUrl(databaseUrl) ? new MemoryStore(seed) : new PostgresStore(databaseUrl, seed);
}
