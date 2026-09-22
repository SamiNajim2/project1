import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(72, "Use at most 72 characters."),
});

/**
 * Creates an account that can sign in immediately. The project's built-in email sender only
 * delivers to team members, so confirmation emails are skipped; the browser signs in right after.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { error } = await getSupabaseAdmin().auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error) {
    if (error.code === "email_exists" || /already (been )?registered/i.test(error.message)) {
      return Response.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
    }
    if (error.code === "weak_password") return Response.json({ error: error.message }, { status: 400 });
    console.error("[signup] failed:", error);
    return Response.json({ error: "Could not create the account. Try again." }, { status: 500 });
  }
  return Response.json({ ok: true }, { status: 201 });
}
