import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { GOOGLE_ERRORS } from "../google-errors";
import { googleEnabled } from "@/lib/google";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next, error } = await searchParams;
  const err = typeof error === "string" ? GOOGLE_ERRORS[error] : undefined;
  return (
    <>
      <h1 className="text-lg font-semibold">Create your free account</h1>
      <p className="mb-5 text-sm text-muted-foreground">140 problems, an AI grader, and progress tracking. No card.</p>
      {err && <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
      <AuthForm mode="signup" next={typeof next === "string" ? next : undefined} google={googleEnabled()} />
    </>
  );
}
