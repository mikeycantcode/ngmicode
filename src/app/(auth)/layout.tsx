import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="relative w-full max-w-sm">
        <Logo className="mb-8 justify-center text-lg" />
        <div className="rounded-xl border bg-card p-6 shadow-xl shadow-black/10">{children}</div>
      </div>
    </div>
  );
}
