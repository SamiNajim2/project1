import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type {
  JiraWorkspace,
  Meeting,
  MeetingReport,
  ProposedJiraChange,
  Utterance,
} from "../../shared/types.js";
import { log } from "../lib/logger.js";
import type { ZenoAgent } from "./claude.js";
import { workspaceContext } from "./prompts.js";

const ReportSchema = z.object({
  headline: z.string().describe("One sentence describing what this meeting was about and where it landed."),
  decisions: z
    .array(
      z.object({
        decision: z.string().describe("A decision the meeting actually made, in one sentence."),
        evidence: z.string().describe("A short quote from the transcript that shows the decision."),
      }),
    )
    .describe("Only decisions that were actually made out loud. Empty array if none."),
  action_items: z.array(
    z.object({
      description: z.string(),
      owner: z.string().nullable().describe("Person named in the meeting, or null if nobody was named."),
      deadline: z.string().nullable().describe("ISO date if a date was said, otherwise null."),
      evidence: z.string().describe("Short supporting quote from the transcript."),
    }),
  ),
  unresolved_questions: z
    .array(z.string())
    .describe("Questions raised in the meeting that were left open."),
  proposed_jira_changes: z.array(
    z.object({
      tool: z.enum(["createIssue", "updateIssue", "transitionIssue", "assignIssue", "addComment"]),
      issue_key: z.string().nullable().describe("Existing issue key, or null when proposing a new issue."),
      change: z.string().describe("The proposed change in one sentence, naming the issue key."),
      status: z.string().nullable().describe("Target status for transitionIssue, otherwise null."),
      assignee: z.string().nullable().describe("Target assignee for assignIssue, otherwise null."),
      comment: z.string().nullable().describe("Comment body for addComment, otherwise null."),
      summary: z.string().nullable().describe("Summary for createIssue, otherwise null."),
      evidence: z.string().describe("Short supporting quote from the transcript."),
    }),
  ),
});

export type ReportDraft = z.infer<typeof ReportSchema>;

/**
 * Builds the post-meeting report from the stored transcript. Proposals stay
 * proposals: applying one still goes through the confirmation and audit path.
 */
export async function generateReport(args: {
  agent: ZenoAgent;
  meeting: Meeting;
  utterances: Utterance[];
  workspace: JiraWorkspace;
}): Promise<MeetingReport> {
  const transcript = args.utterances
    .filter((utterance) => utterance.isFinal)
    .map((utterance) => `${utterance.speaker}: ${utterance.text}`)
    .join("\n");

  if (transcript.trim().length === 0) {
    return emptyReport(args.meeting, "No speech was captured in this meeting, so there is nothing to summarise.");
  }

  const issueKeys = args.workspace.issues.map((issue) => `${issue.key} (${issue.status})`).join(", ");

  const message = await args.agent.anthropic.beta.messages.parse(
    {
    model: args.agent.reportModelName,
    max_tokens: 4000,
    system: [
      "You write the follow-up for a meeting that just ended.",
      "Use only the transcript below. Never invent a decision, an owner, a date or an issue key.",
      "If nobody was named as the owner, set owner to null. If no date was said, set deadline to null.",
      "Propose Jira changes only where the meeting clearly asked for them, and only against issue keys that exist on the board.",
      "",
      workspaceContext(args.workspace),
      `Existing issue keys: ${issueKeys}.`,
    ].join("\n"),
    output_format: betaZodOutputFormat(ReportSchema),
      messages: [
        {
          role: "user",
          content: `Meeting: ${args.meeting.title}\nTranscript:\n${transcript}`,
        },
      ],
    },
    // The follow-up is written after the call, so it can take its time.
    { timeout: 240_000 },
  );

  if (message.stop_reason === "refusal") {
    throw new Error("The model refused to summarise this meeting.");
  }
  if (message.stop_reason === "max_tokens") {
    log.warn("report truncated", { meetingId: args.meeting.id });
  }

  const draft = message.parsed_output as ReportDraft | null;
  if (!draft) throw new Error("The model returned no structured report.");

  const report: MeetingReport = {
    meetingId: args.meeting.id,
    headline: draft.headline,
    decisions: draft.decisions,
    actionItems: draft.action_items.map((item) => ({
      description: item.description,
      owner: item.owner,
      deadline: item.deadline,
      evidence: item.evidence,
    })),
    unresolvedQuestions: draft.unresolved_questions,
    proposedJiraChanges: draft.proposed_jira_changes.map(toProposedChange),
    markdown: "",
    createdAt: new Date().toISOString(),
  };
  report.markdown = renderMarkdown(args.meeting, report);
  return report;
}

function toProposedChange(change: ReportDraft["proposed_jira_changes"][number]): ProposedJiraChange {
  const args: Record<string, unknown> = {};
  if (change.issue_key) args.key = change.issue_key.toUpperCase();
  if (change.tool === "transitionIssue" && change.status) args.status = change.status;
  if (change.tool === "assignIssue") args.assignee = change.assignee;
  if (change.tool === "addComment" && change.comment) args.body = change.comment;
  if (change.tool === "createIssue" && change.summary) args.summary = change.summary;
  if (change.tool === "updateIssue") args.fields = {};
  return {
    tool: change.tool,
    issueKey: change.issue_key ? change.issue_key.toUpperCase() : null,
    summary: change.change,
    args,
    evidence: change.evidence,
  };
}

export function emptyReport(meeting: Meeting, headline: string): MeetingReport {
  const report: MeetingReport = {
    meetingId: meeting.id,
    headline,
    decisions: [],
    actionItems: [],
    unresolvedQuestions: [],
    proposedJiraChanges: [],
    markdown: "",
    createdAt: new Date().toISOString(),
  };
  report.markdown = renderMarkdown(meeting, report);
  return report;
}

/** The exported Markdown follow-up. Deterministic: no model involved. */
export function renderMarkdown(meeting: Meeting, report: MeetingReport): string {
  const lines: string[] = [];
  lines.push(`# ${meeting.title}`);
  lines.push("");
  lines.push(`_Zeno meeting follow-up — ${formatDate(meeting.endedAt ?? report.createdAt)}_`);
  lines.push("");
  lines.push(report.headline);
  lines.push("");

  lines.push("## Decisions");
  if (report.decisions.length === 0) lines.push("_No decisions were recorded._");
  for (const decision of report.decisions) {
    lines.push(`- ${decision.decision}`);
    lines.push(`  - Evidence: "${decision.evidence}"`);
  }
  lines.push("");

  lines.push("## Action items");
  if (report.actionItems.length === 0) lines.push("_No action items were recorded._");
  if (report.actionItems.length > 0) {
    lines.push("| Action | Owner | Deadline |");
    lines.push("| --- | --- | --- |");
    for (const item of report.actionItems) {
      lines.push(`| ${escapeCell(item.description)} | ${item.owner ?? "_unassigned_"} | ${item.deadline ?? "_none stated_"} |`);
    }
  }
  lines.push("");

  lines.push("## Unresolved questions");
  if (report.unresolvedQuestions.length === 0) lines.push("_Nothing was left open._");
  for (const question of report.unresolvedQuestions) lines.push(`- ${question}`);
  lines.push("");

  lines.push("## Proposed Jira changes");
  lines.push("");
  lines.push("_Proposals only. Each one still needs a human confirmation before it is applied._");
  lines.push("");
  if (report.proposedJiraChanges.length === 0) lines.push("_No Jira changes were proposed._");
  for (const change of report.proposedJiraChanges) {
    lines.push(`- **${change.issueKey ?? "new issue"}** — ${change.summary} (\`${change.tool}\`)`);
    lines.push(`  - Evidence: "${change.evidence}"`);
  }
  lines.push("");
  return lines.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
