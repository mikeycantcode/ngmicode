import { unescapeText } from "./mentions";

// Renders canonical message text into a short plain-text preview for
// notifications and the search results list.

export interface PreviewContext {
  userName(userId: string): string | undefined; // display name
  channelName(channelId: string): string | undefined;
}

export function renderPreview(text: string, ctx: PreviewContext, maxLen = 100): string {
  let out = text
    .replace(/<@([a-z0-9_]+)>/g, (_m, id: string) => `@${ctx.userName(id) ?? id}`)
    .replace(/<#([a-z0-9_]+)>/g, (_m, id: string) => `#${ctx.channelName(id) ?? id}`)
    .replace(/<!(here|channel|everyone)>/g, "@$1");
  out = unescapeText(out).replace(/\s+/g, " ").trim();
  return out.length > maxLen ? out.slice(0, maxLen - 1) + "…" : out;
}
