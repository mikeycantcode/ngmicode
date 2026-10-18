import { cn } from "@/lib/utils";

export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n").filter((l) => !l.startsWith("===") && !l.startsWith("Index:"));
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b px-5 py-3 text-sm font-semibold">Your diff</h2>
      <pre className="max-h-[600px] overflow-auto bg-ctp-crust/40 py-2 font-mono text-[12px] leading-5">
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              "px-4 whitespace-pre",
              l.startsWith("+++") || l.startsWith("---")
                ? "mt-2 font-semibold text-ctp-blue"
                : l.startsWith("@@")
                  ? "text-ctp-mauve"
                  : l.startsWith("+")
                    ? "bg-ctp-green/10 text-ctp-green"
                    : l.startsWith("-")
                      ? "bg-ctp-red/10 text-ctp-red"
                      : "text-ctp-subtext0",
            )}
          >
            {l || " "}
          </div>
        ))}
      </pre>
    </section>
  );
}
