import type { LiveEvent } from "../../shared/types.js";

type Listener = (event: LiveEvent) => void;

/** Fan-out of live updates to dashboard SSE clients. In-process by design. */
export class EventBus {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: LiveEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken client must never break event delivery for the others.
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
