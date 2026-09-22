import type { JiraIssue, JiraWorkspace } from "../../shared/types.js";

export interface IssueQuery {
  text?: string;
  status?: string;
  assignee?: string;
  label?: string;
  sprint?: string;
  priority?: string;
  type?: string;
  limit?: number;
}

export interface CreateIssueInput {
  summary: string;
  description?: string;
  type?: string;
  priority?: string;
  assignee?: string | null;
  labels?: string[];
  sprint?: string | null;
  dueDate?: string | null;
  storyPoints?: number | null;
  reporter?: string;
}

export interface UpdateIssueInput {
  summary?: string;
  description?: string;
  priority?: string;
  labels?: string[];
  dueDate?: string | null;
  storyPoints?: number | null;
  sprint?: string | null;
}

/** Before/after pair for the audit log, returned by every successful write. */
export interface WriteResult {
  issue: JiraIssue;
  before: Partial<JiraIssue> | null;
  after: Partial<JiraIssue>;
}

/**
 * The seam a real Atlassian integration would slot into. MockJiraProvider is the
 * only implementation today; JiraCloudProvider would implement the same methods
 * against the Atlassian REST API without the rest of the app changing.
 */
export interface JiraProvider {
  readonly name: string;
  getWorkspace(): Promise<JiraWorkspace>;
  searchIssues(query: IssueQuery): Promise<JiraIssue[]>;
  getIssue(key: string): Promise<JiraIssue | null>;
  createIssue(input: CreateIssueInput): Promise<WriteResult>;
  updateIssue(key: string, input: UpdateIssueInput): Promise<WriteResult>;
  transitionIssue(key: string, status: string): Promise<WriteResult>;
  assignIssue(key: string, assignee: string | null): Promise<WriteResult>;
  addComment(key: string, body: string, author: string): Promise<WriteResult>;
}

/** A write the provider refused. The agent reports these verbatim; it never claims success. */
export class JiraError extends Error {}
