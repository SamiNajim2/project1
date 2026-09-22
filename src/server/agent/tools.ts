import type Anthropic from "@anthropic-ai/sdk";
import type { Approval, CommandChannel, JiraWriteTool } from "../../shared/types.js";
import type { Store } from "../db/store.js";
import { JiraError, type JiraProvider } from "../jira/provider.js";
import { createProposal, describeChange } from "./approvals.js";

/**
 * The seven Jira tools Zeno can call. Reads run immediately; writes never run
 * here — they return a proposal that a human has to confirm in the meeting.
 */
export const jiraTools: Anthropic.Tool[] = [
  {
    name: "searchIssues",
    description:
      "Search the Jira board. Combine filters freely; omit a filter to ignore it. Returns matching issues with their key, status, assignee and labels.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Free text matched against key, summary, description, labels and comments." },
        status: { type: "string", description: "Exact board status, e.g. Blocked, In Progress, Done." },
        assignee: { type: "string", description: "Display name or first name, or 'unassigned'." },
        label: { type: "string", description: "A single label, e.g. launch-blocker." },
        sprint: { type: "string", description: "Sprint name, e.g. Sprint 12." },
        priority: { type: "string" },
        type: { type: "string", description: "Story, Bug or Task." },
        limit: { type: "integer", description: "Maximum issues to return (default 20)." },
      },
    },
  },
  {
    name: "getIssue",
    description: "Read one issue in full, including its description and comments.",
    input_schema: {
      type: "object",
      properties: { key: { type: "string", description: "Issue key, e.g. ATL-103." } },
      required: ["key"],
    },
  },
  {
    name: "createIssue",
    description:
      "Propose creating a new issue. This does NOT create anything: it returns a proposal the meeting must confirm.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        description: { type: "string" },
        type: { type: "string", description: "Story, Bug or Task. Defaults to Task." },
        priority: { type: "string" },
        assignee: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        dueDate: { type: "string", description: "ISO date, e.g. 2026-09-30." },
      },
      required: ["summary"],
    },
  },
  {
    name: "updateIssue",
    description:
      "Propose editing fields on an existing issue. This does NOT change anything: it returns a proposal the meeting must confirm.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        fields: {
          type: "object",
          description: "Fields to change: summary, description, priority, labels, dueDate, storyPoints, sprint.",
          properties: {
            summary: { type: "string" },
            description: { type: "string" },
            priority: { type: "string" },
            labels: { type: "array", items: { type: "string" } },
            dueDate: { type: "string" },
            storyPoints: { type: "number" },
            sprint: { type: "string" },
          },
        },
      },
      required: ["key", "fields"],
    },
  },
  {
    name: "transitionIssue",
    description:
      "Propose moving an issue to another status. This does NOT move it: it returns a proposal the meeting must confirm.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        status: { type: "string", description: "Target status from the board." },
      },
      required: ["key", "status"],
    },
  },
  {
    name: "assignIssue",
    description:
      "Propose assigning an issue to a project member. This does NOT assign it: it returns a proposal the meeting must confirm.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        assignee: { type: ["string", "null"], description: "Display name, or null to unassign." },
      },
      required: ["key", "assignee"],
    },
  },
  {
    name: "addComment",
    description:
      "Propose adding a comment to an issue. This does NOT comment: it returns a proposal the meeting must confirm.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        body: { type: "string" },
      },
      required: ["key", "body"],
    },
  },
];

const WRITE_TOOLS = new Set<string>([
  "createIssue",
  "updateIssue",
  "transitionIssue",
  "assignIssue",
  "addComment",
]);

export function isWriteTool(name: string): name is JiraWriteTool {
  return WRITE_TOOLS.has(name);
}

export interface ToolContext {
  store: Store;
  provider: JiraProvider;
  meetingId: string;
  commandId: string | null;
  requestedBy: string;
  channel: CommandChannel;
  /** One pending proposal per meeting; a second request replaces nothing and is refused. */
  onProposal?: (approval: Approval) => void;
  now?: () => Date;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
  issueKeys: string[];
  approval?: Approval;
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolOutcome> {
  try {
    if (isWriteTool(name)) return await proposeWrite(name, input, context);
    return await runRead(name, input, context);
  } catch (error) {
    const message = error instanceof JiraError ? error.message : `tool failed: ${String(error)}`;
    return { content: message, isError: true, issueKeys: [] };
  }
}

async function runRead(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolOutcome> {
  if (name === "searchIssues") {
    const issues = await context.provider.searchIssues(input as never);
    if (issues.length === 0) {
      return { content: "No issues match that search.", isError: false, issueKeys: [] };
    }
    const rows = issues.map((issue) => ({
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      priority: issue.priority,
      assignee: issue.assignee,
      labels: issue.labels,
      sprint: issue.sprint,
      dueDate: issue.dueDate,
    }));
    return {
      content: JSON.stringify(rows, null, 1),
      isError: false,
      issueKeys: issues.map((issue) => issue.key),
    };
  }

  if (name === "getIssue") {
    const key = String(input.key ?? "");
    const issue = await context.provider.getIssue(key);
    if (!issue) {
      return { content: `${key.toUpperCase()} does not exist in this workspace.`, isError: true, issueKeys: [] };
    }
    return { content: JSON.stringify(issue, null, 1), isError: false, issueKeys: [issue.key] };
  }

  return { content: `Unknown tool "${name}".`, isError: true, issueKeys: [] };
}

async function proposeWrite(
  tool: JiraWriteTool,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolOutcome> {
  const args = normalizeWriteArgs(tool, input);
  const key = typeof args.key === "string" ? args.key : null;

  // Validate against the provider before proposing, so we never offer an impossible change.
  if (key) {
    const issue = await context.provider.getIssue(key);
    if (!issue) {
      return {
        content: `${key} does not exist in this workspace, so there is nothing to change.`,
        isError: true,
        issueKeys: [],
      };
    }
  }
  const preview = await describeChange(context.provider, tool, args);

  const approval = await createProposal(
    context.store,
    context.provider,
    {
      meetingId: context.meetingId,
      commandId: context.commandId,
      tool,
      args,
      requestedBy: context.requestedBy,
      channel: context.channel,
    },
    context.now?.() ?? new Date(),
  );
  context.onProposal?.(approval);

  return {
    content: [
      "PROPOSAL CREATED — nothing has changed in Jira yet.",
      `Proposed change: ${preview}`,
      "Tell the meeting exactly this change in one sentence and ask them to reply \"confirm\" to apply it or \"cancel\" to drop it.",
      "Do not say the change has been made.",
    ].join("\n"),
    isError: false,
    issueKeys: key ? [key] : [],
    approval,
  };
}

function normalizeWriteArgs(tool: JiraWriteTool, input: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = { ...input };
  if (typeof args.key === "string") args.key = args.key.trim().toUpperCase();
  if (tool === "updateIssue" && !args.fields) args.fields = {};
  return args;
}
