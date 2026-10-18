import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { GOOGLE_ERRORS } from "../google-errors";
import { googleEnabled } from "@/lib/google";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const err = typeof error === "string" ? GOOGLE_ERRORS[error] : undefined;
  return (
    <>
      <h1 className="text-lg font-semibold">Welcome back</h1>
      <p className="mb-5 text-sm text-muted-foreground">Log in to continue practicing.</p>
      {err && <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
      <AuthForm mode="login" next={typeof next === "string" ? next : undefined} google={googleEnabled()} />
    </>
  );
}
