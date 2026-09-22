import type { JiraIssue, JiraWorkspace } from "../../shared/types.js";
import type { Store } from "../db/store.js";
import {
  JiraError,
  type CreateIssueInput,
  type IssueQuery,
  type JiraProvider,
  type UpdateIssueInput,
  type WriteResult,
} from "./provider.js";

/** Mock Jira backed by the persisted seed workspace. Writes are atomic per call. */
export class MockJiraProvider implements JiraProvider {
  readonly name = "mock";

  constructor(
    private readonly store: Store,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getWorkspace(): Promise<JiraWorkspace> {
    return this.store.getJira();
  }

  async searchIssues(query: IssueQuery): Promise<JiraIssue[]> {
    const workspace = await this.store.getJira();
    const limit = query.limit ?? 20;
    const text = query.text?.trim().toLowerCase();
    return workspace.issues
      .filter((issue) => {
        if (query.status && !equalsLoose(issue.status, query.status)) return false;
        if (query.priority && !equalsLoose(issue.priority, query.priority)) return false;
        if (query.type && !equalsLoose(issue.type, query.type)) return false;
        if (query.sprint && !equalsLoose(issue.sprint ?? "", query.sprint)) return false;
        if (query.label && !issue.labels.some((l) => equalsLoose(l, query.label!))) return false;
        if (query.assignee) {
          if (query.assignee.toLowerCase() === "unassigned") {
            if (issue.assignee) return false;
          } else if (!matchesPerson(issue.assignee, query.assignee)) return false;
        }
        if (text) {
          const haystack = [
            issue.key,
            issue.summary,
            issue.description,
            issue.labels.join(" "),
            issue.assignee ?? "",
            issue.status,
            ...issue.comments.map((c) => c.body),
          ]
            .join(" ")
            .toLowerCase();
          if (!text.split(/\s+/).every((term) => haystack.includes(term))) return false;
        }
        return true;
      })
      .slice(0, limit);
  }

  async getIssue(key: string): Promise<JiraIssue | null> {
    const workspace = await this.store.getJira();
    return workspace.issues.find((issue) => equalsLoose(issue.key, key)) ?? null;
  }

  async createIssue(input: CreateIssueInput): Promise<WriteResult> {
    if (!input.summary?.trim()) throw new JiraError("summary is required to create an issue");
    return this.store.withJira((workspace) => {
      const key = nextKey(workspace);
      const assignee = input.assignee ? this.resolveUser(workspace, input.assignee) : null;
      const status = "Backlog";
      const timestamp = this.now().toISOString();
      const issue: JiraIssue = {
        key,
        type: input.type ?? "Task",
        summary: input.summary.trim(),
        description: input.description?.trim() ?? "",
        status,
        priority: input.priority ?? "Medium",
        assignee,
        reporter: input.reporter ?? "Zeno",
        labels: input.labels ?? [],
        storyPoints: input.storyPoints ?? null,
        sprint: input.sprint ?? null,
        dueDate: input.dueDate ?? null,
        created: timestamp,
        updated: timestamp,
        comments: [],
      };
      workspace.issues.push(issue);
      return { issue, before: null, after: issue };
    });
  }

  async updateIssue(key: string, input: UpdateIssueInput): Promise<WriteResult> {
    return this.store.withJira((workspace) => {
      const issue = this.requireIssue(workspace, key);
      const fields = Object.keys(input) as (keyof UpdateIssueInput)[];
      if (fields.length === 0) throw new JiraError("no fields given to update");
      const before: Partial<JiraIssue> = {};
      const after: Partial<JiraIssue> = {};
      for (const field of fields) {
        const value = input[field];
        if (value === undefined) continue;
        const record = issue as unknown as Record<string, unknown>;
        (before as Record<string, unknown>)[field] = record[field];
        record[field] = value;
        (after as Record<string, unknown>)[field] = value;
      }
      issue.updated = this.now().toISOString();
      return { issue, before, after };
    });
  }

  async transitionIssue(key: string, status: string): Promise<WriteResult> {
    return this.store.withJira((workspace) => {
      const issue = this.requireIssue(workspace, key);
      const target = workspace.board.statuses.find((s) => equalsLoose(s, status));
      if (!target) {
        throw new JiraError(
          `"${status}" is not a status on this board. Valid statuses: ${workspace.board.statuses.join(", ")}.`,
        );
      }
      if (equalsLoose(issue.status, target)) {
        throw new JiraError(`${issue.key} is already in ${target}.`);
      }
      const before = { status: issue.status };
      issue.status = target;
      issue.updated = this.now().toISOString();
      return { issue, before, after: { status: target } };
    });
  }

  async assignIssue(key: string, assignee: string | null): Promise<WriteResult> {
    return this.store.withJira((workspace) => {
      const issue = this.requireIssue(workspace, key);
      const resolved = assignee ? this.resolveUser(workspace, assignee) : null;
      const before = { assignee: issue.assignee };
      issue.assignee = resolved;
      issue.updated = this.now().toISOString();
      return { issue, before, after: { assignee: resolved } };
    });
  }

  async addComment(key: string, body: string, author: string): Promise<WriteResult> {
    if (!body?.trim()) throw new JiraError("comment body is empty");
    return this.store.withJira((workspace) => {
      const issue = this.requireIssue(workspace, key);
      const comment = { author, body: body.trim(), created: this.now().toISOString() };
      issue.comments.push(comment);
      issue.updated = comment.created;
      return { issue, before: null, after: { comments: [comment] } };
    });
  }

  private requireIssue(workspace: JiraWorkspace, key: string): JiraIssue {
    const issue = workspace.issues.find((candidate) => equalsLoose(candidate.key, key));
    if (!issue) throw new JiraError(`${key.toUpperCase()} does not exist in this workspace.`);
    return issue;
  }

  private resolveUser(workspace: JiraWorkspace, name: string): string {
    const match = workspace.users.find(
      (user) =>
        equalsLoose(user.displayName, name) ||
        equalsLoose(user.email, name) ||
        matchesPerson(user.displayName, name),
    );
    if (!match) {
      throw new JiraError(
        `"${name}" is not a member of this project. Members: ${workspace.users
          .map((user) => user.displayName)
          .join(", ")}.`,
      );
    }
    return match.displayName;
  }
}

function equalsLoose(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** "priya" matches "Priya Raman"; "raman" does too. Ambiguity is resolved by the caller. */
function matchesPerson(fullName: string | null, candidate: string): boolean {
  if (!fullName) return false;
  const parts = fullName.toLowerCase().split(/\s+/);
  const needle = candidate.trim().toLowerCase();
  return fullName.toLowerCase() === needle || parts.includes(needle);
}

function nextKey(workspace: JiraWorkspace): string {
  const prefix = workspace.project.key;
  const highest = workspace.issues.reduce((max, issue) => {
    const [, digits] = issue.key.split("-");
    const value = Number.parseInt(digits ?? "0", 10);
    return Number.isFinite(value) && value > max ? value : max;
  }, 100);
  return `${prefix}-${highest + 1}`;
}
