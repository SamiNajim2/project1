import { log } from "../lib/logger.js";

export interface Speech {
  audio: Buffer;
  contentType: string;
}

export interface SpeechSynthesizer {
  synthesize(text: string): Promise<Speech>;
}

/**
 * ElevenLabs text to speech. Only called while VOICE mode is on; the audio is
 * played by the Output Media webpage, which is what the bot streams into the call.
 */
export class ElevenLabsSynthesizer implements SpeechSynthesizer {
  constructor(
    private readonly apiKey: string,
    private readonly voiceId: string,
    private readonly modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_turbo_v2_5",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async synthesize(text: string): Promise<Speech> {
    const started = Date.now();
    const response = await this.fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: { stability: 0.45, similarity_boost: 0.75, speed: 1.05 },
        }),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`ElevenLabs returned ${response.status}: ${detail}`);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    log.info("speech synthesized", { ms: Date.now() - started, bytes: audio.byteLength });
    return { audio, contentType: "audio/mpeg" };
  }
}

/** Used by tests and demo runs so no ElevenLabs credits are spent. */
export class SilentSynthesizer implements SpeechSynthesizer {
  async synthesize(): Promise<Speech> {
    return { audio: Buffer.from([]), contentType: "audio/mpeg" };
  }
}
