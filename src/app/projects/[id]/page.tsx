import { Workspace } from "@/components/workspace";

export const metadata = { title: "Project · Finance Analyst" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Workspace id={id} />;
}
