"use client";

import { autoMap, suggestSettings } from "../import/auto";
import { parseFile } from "../import/parse";
import { emptyProject, type Project } from "../project";
import { newId, putProject } from "./db";

export const SAMPLE_FILES = [
  "brightwave_pnl_fy2026.xlsx",
  "brightwave_cash_2026.csv",
  "brightwave_mrr_2026.csv",
  "brightwave_forecast_drivers.xlsx",
];

/** Creates a project from the fictional sample files, using exactly the same import path as uploads. */
export async function createSampleProject(): Promise<Project> {
  const files = await Promise.all(
    SAMPLE_FILES.map(async (name) => {
      const res = await fetch(`/samples/${name}`);
      if (!res.ok) throw new Error(`Could not load sample file ${name}`);
      const blob = await res.blob();
      return parseFile(new File([blob], name, { type: name.endsWith(".csv") ? "text/csv" : blob.type }));
    }),
  );
  const project = emptyProject(newId());
  project.isSample = true;
  project.files = files;
  project.mappings = autoMap(files);
  project.settings = { ...project.settings, ...suggestSettings(files, project.mappings, project.settings) };
  project.step = "import";
  await putProject(project);
  return project;
}
