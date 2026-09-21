// Runs the full pipeline against a running Strategy Agent server and writes the finished project.
//
// Usage: npm run dev   (in another terminal)
//        npm run sample:generate [-- --base http://localhost:3000 --out src/data/sample-project.json]
//
// The sample brief is read from the existing sample project file, so the output replaces it in place.

import { readFile, writeFile } from "node:fs/promises";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const base = args.base ?? "http://localhost:3000";
const out = args.out ?? "src/data/sample-project.json";
const briefFile = args.brief ?? "src/data/sample-project.json";

const sample = JSON.parse(await readFile(briefFile, "utf8"));
const project = { ...sample, stages: {}, outputs: {} };
const STAGES = ["plan", "research", "market", "strategy", "business", "summary"];

function bodyFor(stage) {
  const { brief, outputs: o } = project;
  const b = { brief, plan: o.plan };
  switch (stage) {
    case "plan":
      return { brief };
    case "research":
      return { ...b, pdfs: [] };
    case "market":
      return { ...b, research: o.research };
    case "strategy":
      return { ...b, research: o.research, market: o.market };
    case "business":
      return { ...b, research: o.research, strategy: o.strategy };
    case "summary":
      return { ...b, research: o.research, market: o.market, strategy: o.strategy, business: o.business };
  }
}

async function callStage(stage) {
  const res = await fetch(`${base}/api/stages/${stage}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyFor(stage)),
  });
  if (!res.ok) throw new Error(`${stage}: HTTP ${res.status} ${await res.text()}`);
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === "result") return event;
      if (event.type === "error") throw new Error(`${stage}: ${event.message}`);
      if (event.type === "search") console.log(`    search: ${event.query}`);
      else if (event.type === "fetch") console.log(`    fetch:  ${event.url}`);
      else if (event.type === "progress") console.log(`    ${event.message}`);
    }
  }
  throw new Error(`${stage}: stream ended without a result`);
}

const t0 = Date.now();
for (const stage of STAGES) {
  const startedAt = new Date().toISOString();
  const t = Date.now();
  console.log(`\n▶ ${stage}`);
  const { data, model } = await callStage(stage);
  project.outputs[stage] = data;
  project.stages[stage] = { status: "done", startedAt, finishedAt: new Date().toISOString() };
  project.model = model;
  console.log(`  ✓ ${stage} in ${((Date.now() - t) / 1000).toFixed(0)}s (${model})`);
}

const now = new Date().toISOString();
project.createdAt = now;
project.updatedAt = now;
await writeFile(out, `${JSON.stringify(project, null, 2)}\n`);
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`);
