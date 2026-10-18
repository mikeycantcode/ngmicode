// Renders canonical message text into a short plain-text preview for
// notifications and the search results list.

export interface PreviewContext {
  userName(userId: string): string | undefined; // display name
  channelName(channelId: string): string | undefined;
}

const TOKEN_RE = /<(@|#|!)([a-z0-9_]+)>/g;
const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&" };

export function renderPreview(text: string, ctx: PreviewContext, maxLen = 100): string {
  if (!Number.isInteger(maxLen) || maxLen < 2) throw new RangeError("maxLen must be an integer >= 2");

  // 1+2: strip markdown from the message text only (not inside tokens), then substitute tokens.
  let out = "";
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    out += stripMarkdown(text.slice(last, m.index));
    out += renderToken(m[1], m[2], ctx);
    last = (m.index ?? 0) + m[0].length;
  }
  out += stripMarkdown(text.slice(last));

  // 3: single-pass un-escape. 4: whitespace.
  out = out.replace(/&(lt|gt|amp);/g, (e) => ENTITIES[e]).replace(/\s+/g, " ").trim();

  if (out.length <= maxLen) return out;
  const budget = maxLen - 1;
  let head = out.slice(0, budget);
  if (out[budget] !== " ") {
    const sp = head.lastIndexOf(" ");
    if (sp >= Math.floor(budget / 2)) head = head.slice(0, sp);
  }
  const lastCode = head.charCodeAt(head.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) head = head.slice(0, -1);
  return head.trimEnd() + "…";
}

function stripMarkdown(s: string): string {
  return s.replace(/[*_~`]/g, "");
}

function renderToken(sigil: string, id: string, ctx: PreviewContext): string {
  if (sigil === "@") return `@${ctx.userName(id) ?? "unknown"}`;
  if (sigil === "#") return `#${ctx.channelName(id) ?? "unknown"}`;
  if (id === "here" || id === "channel" || id === "everyone") return `@${id}`;
  return `<!${id}>`;
}
