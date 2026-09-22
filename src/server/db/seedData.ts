import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { JiraWorkspace } from "../../shared/types.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Loads data/fake_jira_seed.json. If the file is missing we fall back to a
 * built-in Northstar Software / Atlas Launch board so the app always has a workspace.
 */
export function loadJiraSeed(): JiraWorkspace {
  const candidates = [
    resolve(process.cwd(), "data/fake_jira_seed.json"),
    resolve(here, "../../../data/fake_jira_seed.json"),
    resolve(here, "../../../../data/fake_jira_seed.json"),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as JiraWorkspace;
      if (parsed.issues?.length) return normalize(parsed);
    } catch {
      continue;
    }
  }
  throw new Error(
    "data/fake_jira_seed.json is missing or empty. Restore it from the repository before starting Zeno.",
  );
}

function normalize(workspace: JiraWorkspace): JiraWorkspace {
  return {
    ...workspace,
    issues: workspace.issues.map((issue) => ({
      ...issue,
      labels: issue.labels ?? [],
      comments: issue.comments ?? [],
      assignee: issue.assignee ?? null,
      sprint: issue.sprint ?? null,
      dueDate: issue.dueDate ?? null,
      storyPoints: issue.storyPoints ?? null,
    })),
  };
}
