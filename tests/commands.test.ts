import { describe, expect, it } from "vitest";
import {
  Cooldown,
  Deduper,
  estimateSpeechSeconds,
  fitSpokenAnswer,
  MAX_SPOKEN_SECONDS,
  parseChatCommand,
  parseVoiceCommand,
  stripHtml,
} from "../src/server/agent/commands.js";

describe("chat commands", () => {
  it("accepts /zeno and zeno: prefixes", () => {
    expect(parseChatCommand("/zeno show launch blockers")).toEqual({
      kind: "question",
      question: "show launch blockers",
    });
    expect(parseChatCommand("Zeno: what is ATL-104?")).toEqual({
      kind: "question",
      question: "what is ATL-104?",
    });
  });

  it("ignores ordinary chat", () => {
    expect(parseChatCommand("can someone ping zeno about this?").kind).toBe("none");
    expect(parseChatCommand("").kind).toBe("none");
  });

  it("reads confirm and cancel with or without the prefix", () => {
    expect(parseChatCommand("confirm").kind).toBe("confirm");
    expect(parseChatCommand("/zeno cancel").kind).toBe("cancel");
    expect(parseChatCommand("Confirm.").kind).toBe("confirm");
  });

  it("strips the HTML that Teams sends for formatted messages", () => {
    expect(stripHtml('<p><b>/zeno</b> show <i>launch</i> blockers</p>')).toBe("/zeno show launch blockers");
    expect(parseChatCommand("<div>/zeno&nbsp;list bugs<br/></div>")).toEqual({
      kind: "question",
      question: "list bugs",
    });
  });
});

describe("voice wake phrase", () => {
  it("triggers only at the start of an utterance", () => {
    expect(parseVoiceCommand("Zeno, summarize Sprint 12.")).toEqual({
      kind: "question",
      question: "summarize Sprint 12.",
    });
    expect(parseVoiceCommand("Hey Zeno what is blocking the launch")).toEqual({
      kind: "question",
      question: "what is blocking the launch",
    });
    expect(parseVoiceCommand("we should ask Zeno about that later").kind).toBe("none");
    expect(parseVoiceCommand("I think Zeno, can help here").kind).toBe("none");
  });

  it("reads spoken confirmations", () => {
    expect(parseVoiceCommand("Zeno, confirm.").kind).toBe("confirm");
    expect(parseVoiceCommand("Zeno cancel").kind).toBe("cancel");
  });

  it("ignores a bare wake word with nothing after it", () => {
    expect(parseVoiceCommand("Zeno").kind).toBe("none");
  });
});

describe("dedupe and cooldown", () => {
  it("suppresses a repeat of the same utterance inside the window", () => {
    const deduper = new Deduper(20000);
    expect(deduper.isDuplicate("a", 1000)).toBe(false);
    expect(deduper.isDuplicate("a", 5000)).toBe(true);
    expect(deduper.isDuplicate("a", 40000)).toBe(false);
  });

  it("blocks a new spoken answer until the previous one has finished plus the gap", () => {
    const cooldown = new Cooldown(8000);
    expect(cooldown.ready(0)).toBe(true);
    cooldown.start(6000, 0);
    expect(cooldown.ready(10000)).toBe(false);
    expect(cooldown.ready(14001)).toBe(true);
  });
});

describe("spoken answer budget", () => {
  it("keeps answers under 25 seconds of speech", () => {
    const long = "This is a sentence about the launch. ".repeat(20);
    const fitted = fitSpokenAnswer(long);
    expect(estimateSpeechSeconds(fitted)).toBeLessThanOrEqual(MAX_SPOKEN_SECONDS);
  });

  it("leaves a short answer untouched and keeps whole sentences", () => {
    const answer = "ATL-102 is blocked on Okta. Dana is escalating it today.";
    expect(fitSpokenAnswer(answer)).toBe(answer);
  });
});
