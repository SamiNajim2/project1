import { ProjectWorkspace } from "@/components/project-workspace";

export const metadata = { title: "Project · Strategy Agent" };

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { run } = await searchParams;
  return <ProjectWorkspace id={id} autoRun={run === "1"} />;
}
