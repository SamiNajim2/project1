import Anthropic from "@anthropic-ai/sdk";
import type { Approval, CommandChannel, JiraWorkspace, Utterance } from "../../shared/types.js";
import { log } from "../lib/logger.js";
import { fitSpokenAnswer } from "./commands.js";
import {
  AGENT_RULES,
  pendingApprovalContext,
  spokenConstraint,
  transcriptContext,
  workspaceContext,
} from "./prompts.js";
import { jiraTools, runTool, type ToolContext } from "./tools.js";

export interface AnswerRequest {
  question: string;
  asker: string;
  channel: CommandChannel;
  spoken: boolean;
  meetingTitle: string;
  transcript: Utterance[];
  workspace: JiraWorkspace;
  pendingApproval: Approval | null;
  toolContext: ToolContext;
}

export interface AnswerResult {
  answer: string;
  spokenAnswer: string;
  issueKeys: string[];
  approval: Approval | null;
  toolCalls: { name: string; input: unknown }[];
}

const MAX_TOOL_ROUNDS = 5;
/** A live meeting will not wait: give up rather than answer into a conversation that moved on. */
const LIVE_TIMEOUT_MS = 45_000;
const CANNOT_VERIFY = "I can't verify that from this meeting or the Jira board.";

export class ZenoAgent {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly liveModel: string,
    private readonly reportModel: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: LIVE_TIMEOUT_MS });
  }

  /** Answers one question from the meeting, using Jira tools as needed. */
  async answer(request: AnswerRequest): Promise<AnswerResult> {
    const system = [
      AGENT_RULES,
      "",
      spokenConstraint(request.spoken),
      "",
      workspaceContext(request.workspace),
      "",
      pendingApprovalContext(request.pendingApproval),
    ].join("\n");

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          `Meeting: ${request.meetingTitle}`,
          "",
          "Transcript so far (most recent last):",
          transcriptContext(request.transcript),
          "",
          `${request.asker} asked Zeno${request.channel === "voice" ? " out loud" : " in the chat"}: ${request.question}`,
          "",
          "Answer now, following every ground rule.",
        ].join("\n"),
      },
    ];

    const issueKeys = new Set<string>();
    const toolCalls: { name: string; input: unknown }[] = [];
    let approval: Approval | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.client.messages.create(
        { model: this.liveModel, max_tokens: 1200, system, tools: jiraTools, messages },
        { timeout: LIVE_TIMEOUT_MS },
      );

      if (response.stop_reason === "refusal") {
        return {
          answer: CANNOT_VERIFY,
          spokenAnswer: CANNOT_VERIFY,
          issueKeys: [...issueKeys],
          approval,
          toolCalls,
        };
      }

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      if (toolUses.length === 0) {
        const answer = textOf(response).trim() || CANNOT_VERIFY;
        return {
          answer,
          spokenAnswer: fitSpokenAnswer(answer),
          issueKeys: [...issueKeys],
          approval,
          toolCalls,
        };
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const outcome = await runTool(
          toolUse.name,
          (toolUse.input ?? {}) as Record<string, unknown>,
          request.toolContext,
        );
        toolCalls.push({ name: toolUse.name, input: toolUse.input });
        outcome.issueKeys.forEach((key) => issueKeys.add(key));
        if (outcome.approval) approval = outcome.approval;
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
        log.info("tool call", {
          tool: toolUse.name,
          meetingId: request.toolContext.meetingId,
          isError: outcome.isError,
        });
      }
      messages.push({ role: "user", content: results });
    }

    const fallback =
      "I looked but could not finish that one — ask me again in a moment, or check the board directly.";
    return {
      answer: fallback,
      spokenAnswer: fallback,
      issueKeys: [...issueKeys],
      approval,
      toolCalls,
    };
  }

  get reportModelName(): string {
    return this.reportModel;
  }

  get anthropic(): Anthropic {
    return this.client;
  }
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
