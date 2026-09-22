import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/server/db/memory.js";
import { loadJiraSeed } from "../src/server/db/seedData.js";
import { MockJiraProvider } from "../src/server/jira/mock.js";
import {
  APPROVAL_TTL_MS,
  applyProposal,
  cancelProposal,
  createProposal,
  pendingProposal,
} from "../src/server/agent/approvals.js";

let store: MemoryStore;
let jira: MockJiraProvider;

const proposal = {
  meetingId: "11111111-1111-4111-8111-111111111111",
  commandId: null,
  requestedBy: "Sofia Alvarez",
  channel: "text" as const,
};

beforeEach(async () => {
  store = new MemoryStore(loadJiraSeed());
  await store.init();
  jira = new MockJiraProvider(store);
});

describe("proposals", () => {
  it("describes the exact change and does not touch Jira", async () => {
    const approval = await createProposal(store, jira, {
      ...proposal,
      tool: "transitionIssue",
      args: { key: "ATL-103", status: "Done" },
    });
    expect(approval.preview).toBe(
      'Move ATL-103 "Publish the Atlas public API reference" from In Review to Done.',
    );
    expect(approval.status).toBe("pending");
    expect((await jira.getIssue("ATL-103"))?.status).toBe("In Review");
  });

  it("shows before and after for a field update", async () => {
    const approval = await createProposal(store, jira, {
      ...proposal,
      tool: "updateIssue",
      args: { key: "ATL-105", fields: { priority: "Highest" } },
    });
    expect(approval.preview).toContain("priority: High → Highest");
  });

  it("expires five minutes after it was made", async () => {
    const created = new Date("2026-09-22T10:00:00Z");
    await createProposal(
      store,
      jira,
      { ...proposal, tool: "assignIssue", args: { key: "ATL-107", assignee: "Priya Raman" } },
      created,
    );
    const justInside = new Date(created.getTime() + APPROVAL_TTL_MS - 1000);
    expect(await pendingProposal(store, proposal.meetingId, justInside)).not.toBeNull();

    const justOutside = new Date(created.getTime() + APPROVAL_TTL_MS + 1000);
    expect(await pendingProposal(store, proposal.meetingId, justOutside)).toBeNull();
    const [approval] = await store.listApprovals(proposal.meetingId);
    expect(approval?.status).toBe("expired");
    expect((await jira.getIssue("ATL-107"))?.assignee).toBeNull();
  });
});

describe("applying a confirmed proposal", () => {
  it("writes to Jira and records before and after in the audit log", async () => {
    const approval = await createProposal(store, jira, {
      ...proposal,
      tool: "transitionIssue",
      args: { key: "ATL-103", status: "Done" },
    });
    const outcome = await applyProposal(store, jira, approval, "Priya Raman");

    expect(outcome.ok).toBe(true);
    expect(outcome.message).toBe("Done — ATL-103 is now Done.");
    expect((await jira.getIssue("ATL-103"))?.status).toBe("Done");

    const audit = await store.listAuditEvents(proposal.meetingId);
    expect(audit.map((event) => event.action)).toEqual([
      "proposed:transitionIssue",
      "applied:transitionIssue",
    ]);
    expect(audit[1]?.before).toEqual({ status: "In Review" });
    expect(audit[1]?.after).toEqual({ status: "Done" });
    expect(audit[1]?.actor).toBe("Priya Raman");
  });

  it("never claims success when the provider refuses", async () => {
    const approval = await createProposal(store, jira, {
      ...proposal,
      tool: "transitionIssue",
      args: { key: "ATL-106", status: "Done" },
    });
    const outcome = await applyProposal(store, jira, approval, "Priya Raman");

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/did not go through/);
    expect(outcome.approval.status).toBe("failed");
    expect((await store.listAuditEvents(proposal.meetingId)).at(-1)?.action).toBe("failed:transitionIssue");
  });

  it("cancelling leaves Jira untouched and is audited", async () => {
    const approval = await createProposal(store, jira, {
      ...proposal,
      tool: "assignIssue",
      args: { key: "ATL-107", assignee: "Priya Raman" },
    });
    const cancelled = await cancelProposal(store, approval, "Tom Becker");

    expect(cancelled.status).toBe("cancelled");
    expect((await jira.getIssue("ATL-107"))?.assignee).toBeNull();
    expect((await store.listAuditEvents(proposal.meetingId)).at(-1)?.action).toBe("cancelled:assignIssue");
    expect(await pendingProposal(store, proposal.meetingId)).toBeNull();
  });
});
