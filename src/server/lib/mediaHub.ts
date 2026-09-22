import { randomUUID } from "node:crypto";
import type { AgentVisualState, MediaEvent, ModeState } from "../../shared/types.js";

interface Clip {
  audio: Buffer;
  contentType: string;
  createdAt: number;
}

type Listener = (event: MediaEvent) => void;

const CLIP_TTL_MS = 10 * 60 * 1000;

/**
 * Bridges the server and the Output Media webpage the bot streams into the call:
 * one SSE channel per meeting plus a short-lived store for generated speech.
 */
export class MediaHub {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly clips = new Map<string, Clip>();
  private readonly state = new Map<string, AgentVisualState>();

  subscribe(meetingId: string, listener: Listener): () => void {
    const set = this.listeners.get(meetingId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(meetingId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(meetingId);
    };
  }

  publish(meetingId: string, event: MediaEvent): void {
    if (event.type === "state") this.state.set(meetingId, event.state);
    for (const listener of this.listeners.get(meetingId) ?? []) {
      try {
        listener(event);
      } catch {
        // ignore a broken page
      }
    }
  }

  setModes(meetingId: string, modes: ModeState): void {
    this.publish(meetingId, { type: "modes", modes });
  }

  visualState(meetingId: string): AgentVisualState {
    return this.state.get(meetingId) ?? "idle";
  }

  /** Stores a generated clip and returns the id the webpage will fetch it by. */
  storeClip(audio: Buffer, contentType: string): string {
    this.evictExpired();
    const id = randomUUID();
    this.clips.set(id, { audio, contentType, createdAt: Date.now() });
    return id;
  }

  getClip(id: string): Clip | null {
    this.evictExpired();
    return this.clips.get(id) ?? null;
  }

  connectedPages(meetingId: string): number {
    return this.listeners.get(meetingId)?.size ?? 0;
  }

  private evictExpired(): void {
    const cutoff = Date.now() - CLIP_TTL_MS;
    for (const [id, clip] of this.clips) {
      if (clip.createdAt < cutoff) this.clips.delete(id);
    }
  }
}
