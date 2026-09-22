import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/server/db/memory.js";
import { loadJiraSeed } from "../src/server/db/seedData.js";
import { MockJiraProvider } from "../src/server/jira/mock.js";
import { JiraError } from "../src/server/jira/provider.js";

let store: MemoryStore;
let jira: MockJiraProvider;

beforeEach(async () => {
  store = new MemoryStore(loadJiraSeed());
  await store.init();
  jira = new MockJiraProvider(store);
});

describe("seed workspace", () => {
  it("contains the Atlas Launch board with ATL-101 to ATL-108", async () => {
    const workspace = await jira.getWorkspace();
    expect(workspace.project.key).toBe("ATL");
    expect(workspace.issues.map((issue) => issue.key)).toEqual([
      "ATL-101", "ATL-102", "ATL-103", "ATL-104", "ATL-105", "ATL-106", "ATL-107", "ATL-108",
    ]);
  });
});

describe("reads", () => {
  it("filters by label, status and assignee", async () => {
    expect((await jira.searchIssues({ label: "launch-blocker" })).map((i) => i.key)).toEqual([
      "ATL-101", "ATL-102", "ATL-105",
    ]);
    expect((await jira.searchIssues({ status: "Blocked" })).map((i) => i.key)).toEqual(["ATL-102"]);
    expect((await jira.searchIssues({ assignee: "marcus" })).map((i) => i.key)).toEqual(["ATL-101", "ATL-106"]);
    expect((await jira.searchIssues({ assignee: "unassigned" })).map((i) => i.key)).toEqual(["ATL-107"]);
  });

  it("matches free text across summary, description and comments", async () => {
    expect((await jira.searchIssues({ text: "okta" })).map((i) => i.key)).toEqual(["ATL-102"]);
    expect((await jira.searchIssues({ text: "rounding" })).map((i) => i.key)).toEqual(["ATL-101"]);
  });

  it("is case insensitive on issue keys", async () => {
    expect((await jira.getIssue("atl-104"))?.summary).toContain("Onboarding checklist");
    expect(await jira.getIssue("ATL-999")).toBeNull();
  });
});

describe("writes", () => {
  it("transitions an issue and reports before and after", async () => {
    const result = await jira.transitionIssue("ATL-103", "Done");
    expect(result.before).toEqual({ status: "In Review" });
    expect(result.after).toEqual({ status: "Done" });
    expect((await jira.getIssue("ATL-103"))?.status).toBe("Done");
  });

  it("refuses a status that is not on the board", async () => {
    await expect(jira.transitionIssue("ATL-103", "Shipped")).rejects.toBeInstanceOf(JiraError);
    expect((await jira.getIssue("ATL-103"))?.status).toBe("In Review");
  });

  it("refuses a transition that changes nothing", async () => {
    await expect(jira.transitionIssue("ATL-106", "Done")).rejects.toThrow(/already in Done/);
  });

  it("refuses an unknown issue and lists valid members for an unknown assignee", async () => {
    await expect(jira.transitionIssue("ATL-404", "Done")).rejects.toThrow(/does not exist/);
    await expect(jira.assignIssue("ATL-107", "Bob Smith")).rejects.toThrow(/not a member/);
  });

  it("resolves an assignee by first name", async () => {
    const result = await jira.assignIssue("ATL-107", "priya");
    expect(result.after).toEqual({ assignee: "Priya Raman" });
  });

  it("creates the next key in sequence and starts in Backlog", async () => {
    const created = await jira.createIssue({ summary: "Write the launch comms plan", assignee: "Sofia Alvarez" });
    expect(created.issue.key).toBe("ATL-109");
    expect(created.issue.status).toBe("Backlog");
    expect((await jira.getWorkspace()).issues).toHaveLength(9);
  });

  it("appends comments without losing existing ones", async () => {
    await jira.addComment("ATL-101", "Rounding fix merged.", "Zeno");
    const issue = await jira.getIssue("ATL-101");
    expect(issue?.comments).toHaveLength(3);
    expect(issue?.comments.at(-1)?.body).toBe("Rounding fix merged.");
  });

  it("rejects an empty comment and an empty update", async () => {
    await expect(jira.addComment("ATL-101", "   ", "Zeno")).rejects.toBeInstanceOf(JiraError);
    await expect(jira.updateIssue("ATL-101", {})).rejects.toThrow(/no fields/);
  });
});
