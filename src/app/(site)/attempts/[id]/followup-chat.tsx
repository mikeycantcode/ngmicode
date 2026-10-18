"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Flag, Loader2, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function FollowupChat({
  attemptId,
  initial,
  open,
  final,
}: {
  attemptId: string;
  initial: Msg[];
  open: boolean;
  final: { score: number; evidence: string } | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const ended = messages.some((m) => m.role === "assistant" && m.content.includes("[END]"));

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/followup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Interviewer unavailable");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += dec.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: reply }]);
      }
    } catch (e) {
      toast.error((e as Error).message);
      setMessages(next.slice(0, -1));
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/finalize`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFinishing(false);
    }
  };

  return (
    <section className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <MessagesSquare className="size-4 text-ctp-mauve" />
        <h2 className="text-sm font-semibold">Follow-up interview</h2>
        {!open && <span className="ml-auto rounded bg-ctp-surface0 px-1.5 py-0.5 text-[11px] text-muted-foreground">closed</span>}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {open && (
          <p className="text-xs text-muted-foreground">
            The interviewer read your session. Answer like you would out loud — specific, honest, with trade-offs. Your answers adjust the final score by up to ±10.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("rounded-lg px-3 py-2 text-[13.5px]", m.role === "assistant" ? "bg-ctp-surface0/60" : "ml-6 bg-ctp-mauve/10")}>
            <div className="mb-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">{m.role === "assistant" ? "Interviewer" : "You"}</div>
            {m.content ? (
              <div className="prose-ctp">
                <ReactMarkdown>{m.content.replace("[END]", "").trim()}</ReactMarkdown>
              </div>
            ) : (
              <Loader2 className="size-3.5 animate-spin" />
            )}
          </div>
        ))}
        {final && (
          <div className="rounded-lg border border-ctp-mauve/30 bg-ctp-mauve/5 px-3 py-2 text-[13px]">
            <div className="text-[10.5px] font-medium tracking-wide text-ctp-mauve uppercase">Follow-up score {final.score}/4</div>
            <p className="mt-1 text-muted-foreground">{final.evidence}</p>
          </div>
        )}
      </div>
      {open && (
        <div className="border-t p-3">
          {!ended && (
            <div className="rounded-lg border bg-ctp-base focus-within:border-ctp-mauve/60">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={3}
                placeholder="Your answer…"
                className="block w-full resize-none bg-transparent px-3 py-2 text-[13px] outline-none"
              />
              <div className="flex justify-end px-2 pb-1.5">
                <button onClick={send} disabled={!draft.trim() || busy} className="flex size-7 items-center justify-center rounded-md bg-ctp-mauve text-ctp-crust disabled:opacity-30">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                </button>
              </div>
            </div>
          )}
          <Button variant={ended ? "default" : "outline"} className="mt-2 h-9 w-full" onClick={finish} disabled={finishing || busy}>
            {finishing ? <Loader2 className="animate-spin" /> : <Flag />} {ended ? "Get final assessment" : "End interview & get final score"}
          </Button>
        </div>
      )}
    </section>
  );
}
