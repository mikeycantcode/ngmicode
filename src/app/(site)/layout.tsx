import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { LogoMark } from "@/components/logo";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <LogoMark className="size-5" />
            <span>SteerCode — free practice for AI-assisted coding interviews.</span>
          </div>
          <div className="flex gap-4 sm:ml-auto">
            <Link href="/formats" className="hover:text-foreground">Formats</Link>
            <Link href="/roadmap" className="hover:text-foreground">Roadmap</Link>
            <a href="https://github.com/mikeycantcode/steercode" className="hover:text-foreground">GitHub</a>
          </div>
        </div>
      </footer>
    </>
  );
}
