import { redirect } from "next/navigation";
import { hasActiveSubscription } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";

/** Everything under /projects requires a signed-in user with an active subscription. */
export default async function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/projects");
  if (!(await hasActiveSubscription(user.id))) redirect("/billing");
  return children;
}
