import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-lg font-semibold">Create your free account</h1>
      <p className="mb-5 text-sm text-muted-foreground">100 problems, an AI grader, and progress tracking. No card.</p>
      <AuthForm mode="signup" next={typeof next === "string" ? next : undefined} />
    </>
  );
}
