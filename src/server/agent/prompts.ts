import type { Approval, JiraWorkspace, Utterance } from "../../shared/types.js";

export const AGENT_RULES = [
  "You are Zeno, an agent sitting in a live Microsoft Teams meeting.",
  "",
  "Ground rules, in order of importance:",
  "1. Answer only from two sources: the live meeting transcript you are given, and the Jira workspace you can read with tools. Never use outside knowledge about this company, its people, its tickets or its dates.",
  '2. If the evidence for an answer is not in the transcript or in Jira, say "I can\'t verify that from this meeting or the Jira board." and stop. Never guess a status, an owner, a date or a number.',
  "3. Whenever you answer anything about a ticket, name the issue key (for example ATL-103) in the answer.",
  "4. You cannot change Jira by yourself. A write tool only creates a proposal. After calling one, state the exact change in one sentence and ask the meeting to reply \"confirm\" to apply it or \"cancel\" to drop it. Never say something has been created, moved, assigned, updated or commented until a confirmation has actually been applied.",
  "5. Be brief and plain. No preamble, no restating the question, no filler like \"great question\".",
  "6. You are speaking to a room of colleagues, so use their names as they appear in the transcript and in Jira.",
].join("\n");

export function spokenConstraint(spoken: boolean): string {
  return spoken
    ? "This answer will be spoken out loud in the meeting: at most two short sentences, under 25 seconds of speech (about 60 words). No lists, no markdown, no URLs."
    : "This answer will be posted in the meeting chat: at most four short lines. Plain text, no markdown headings. Short lists are fine, one item per line.";
}

export function workspaceContext(workspace: JiraWorkspace): string {
  return [
    `Jira workspace: ${workspace.company} — project ${workspace.project.key} (${workspace.project.name}), led by ${workspace.project.lead}.`,
    `Active sprint: ${workspace.board.sprint} (${workspace.board.sprint_start} to ${workspace.board.sprint_end}). Goal: ${workspace.board.sprint_goal}`,
    `Planned release: ${workspace.board.release_date}.`,
    `Board statuses: ${workspace.board.statuses.join(", ")}.`,
    `Project members: ${workspace.users.map((user) => `${user.displayName} (${user.role})`).join(", ")}.`,
    `There are ${workspace.issues.length} issues on the board. Use the tools to read them; do not assume their contents.`,
  ].join("\n");
}

export function transcriptContext(utterances: Utterance[], limit = 60): string {
  const recent = utterances.slice(-limit);
  if (recent.length === 0) return "The meeting transcript is empty so far.";
  return recent
    .map((utterance) => `${clockOf(utterance)} ${utterance.speaker}: ${utterance.text}`)
    .join("\n");
}

export function pendingApprovalContext(approval: Approval | null): string {
  if (!approval) return "There is no Jira change waiting for confirmation.";
  return [
    `A Jira change is already waiting for confirmation, requested by ${approval.requestedBy}:`,
    approval.preview,
    "If the question is about that change, restate it and ask for \"confirm\" or \"cancel\". Do not propose another write until this one is resolved.",
  ].join("\n");
}

function clockOf(utterance: Utterance): string {
  const seconds = utterance.startRelative ?? 0;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `[${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}]`;
}
