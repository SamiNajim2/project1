// Types shared by the Node server and the React dashboard.

export type MeetingStatus =
  | "scheduled"
  | "joining"
  | "lobby"
  | "active"
  | "ended"
  | "failed";

/** The three switches are independent: any combination is valid, including all off. */
export interface ModeState {
  text: boolean;
  voice: boolean;
  video: boolean;
}

export type ModeName = keyof ModeState;

export interface Meeting {
  id: string;
  botId: string | null;
  meetingUrl: string;
  title: string;
  platform: string;
  status: MeetingStatus;
  statusDetail: string | null;
  modes: ModeState;
  demo: boolean;
  /** True while the bot is streaming the Zeno webpage into the call. */
  outputMediaActive: boolean;
  recordingId: string | null;
  createdAt: string;
  joinedAt: string | null;
  endedAt: string | null;
}

export interface Utterance {
  id: string;
  meetingId: string;
  speaker: string;
  participantId: string | null;
  text: string;
  isFinal: boolean;
  startRelative: number | null;
  endRelative: number | null;
  receivedAt: string;
}

export interface ChatMessage {
  id: string;
  meetingId: string;
  sender: string;
  text: string;
  fromBot: boolean;
  createdAt: string;
}

export type CommandChannel = "text" | "voice" | "dashboard";
export type CommandStatus =
  | "received"
  | "answered"
  | "awaiting_confirmation"
  | "failed"
  | "ignored";

export interface CommandRecord {
  id: string;
  meetingId: string;
  channel: CommandChannel;
  requester: string;
  rawText: string;
  question: string;
  status: CommandStatus;
  answer: string | null;
  spokenAnswer: string | null;
  issueKeys: string[];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  latencyMs: number | null;
}

export type ApprovalStatus =
  | "pending"
  | "applied"
  | "cancelled"
  | "expired"
  | "failed";

export interface Approval {
  id: string;
  meetingId: string;
  commandId: string | null;
  tool: JiraWriteTool;
  args: Record<string, unknown>;
  preview: string;
  status: ApprovalStatus;
  requestedBy: string;
  channel: CommandChannel;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  error: string | null;
}

export interface AuditEvent {
  id: string;
  meetingId: string | null;
  actor: string;
  action: string;
  issueKey: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  detail: string | null;
  createdAt: string;
}

export interface JiraComment {
  author: string;
  body: string;
  created: string;
}

export interface JiraIssue {
  key: string;
  type: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string;
  labels: string[];
  storyPoints: number | null;
  sprint: string | null;
  dueDate: string | null;
  created: string;
  updated: string;
  comments: JiraComment[];
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  email: string;
  role: string;
}

export interface JiraBoard {
  sprint: string;
  sprint_goal: string;
  sprint_start: string;
  sprint_end: string;
  release_date: string;
  statuses: string[];
}

export interface JiraProject {
  key: string;
  name: string;
  lead: string;
  description: string;
}

export interface JiraWorkspace {
  company: string;
  project: JiraProject;
  board: JiraBoard;
  users: JiraUser[];
  issues: JiraIssue[];
}

export type JiraReadTool = "searchIssues" | "getIssue";
export type JiraWriteTool =
  | "createIssue"
  | "updateIssue"
  | "transitionIssue"
  | "assignIssue"
  | "addComment";
export type JiraTool = JiraReadTool | JiraWriteTool;

export interface ActionItem {
  description: string;
  owner: string | null;
  deadline: string | null;
  evidence: string;
}

export interface ProposedJiraChange {
  tool: JiraWriteTool;
  issueKey: string | null;
  summary: string;
  args: Record<string, unknown>;
  evidence: string;
}

export interface MeetingReport {
  meetingId: string;
  headline: string;
  decisions: { decision: string; evidence: string }[];
  actionItems: ActionItem[];
  unresolvedQuestions: string[];
  proposedJiraChanges: ProposedJiraChange[];
  markdown: string;
  createdAt: string;
}

/** Server-sent event pushed to the dashboard. */
export type LiveEvent =
  | { type: "meeting"; meeting: Meeting }
  | { type: "utterance"; utterance: Utterance }
  | { type: "chat"; message: ChatMessage }
  | { type: "command"; command: CommandRecord }
  | { type: "approval"; approval: Approval }
  | { type: "audit"; event: AuditEvent }
  | { type: "report"; report: MeetingReport }
  | { type: "agent"; state: AgentVisualState; meetingId: string }
  | { type: "ping" };

export type AgentVisualState = "idle" | "listening" | "thinking" | "responding";

/** Event stream consumed by the Output Media webpage the bot streams into the call. */
export type MediaEvent =
  | { type: "hello"; meetingId: string; modes: ModeState; state: AgentVisualState }
  | { type: "modes"; modes: ModeState }
  | { type: "state"; state: AgentVisualState }
  | { type: "speak"; speechId: string; text: string; url: string }
  | { type: "caption"; text: string }
  | { type: "ping" };
