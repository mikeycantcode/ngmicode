import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark className="size-10" />
      <h1 className="font-mono text-2xl">404 — file not found</h1>
      <p className="text-sm text-muted-foreground">The agent searched everywhere. This page isn&apos;t in the repo.</p>
      <Button render={<Link href="/problems" />}>Back to problems</Button>
    </div>
  );
}
