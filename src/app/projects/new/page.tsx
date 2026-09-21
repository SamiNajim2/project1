import Link from "next/link";
import { ProjectForm } from "@/components/project-form";
import { Header } from "@/components/ui";

export const metadata = { title: "New project · Strategy Agent" };

export default function NewProjectPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-20 sm:px-6">
        <Link href="/projects" className="text-sm text-muted hover:text-orange-700">
          ← All projects
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">New strategy project</h1>
        <p className="mt-2 mb-8 text-ink-soft">Describe the company and the decision. Add any evidence you already trust.</p>
        <ProjectForm />
      </main>
    </>
  );
}
