import type { Channel, Mention, User } from "./types";

// Mention handling.
//
// Clients send plain text ("hey @alice, see #design"). On post we:
//   1. escape &, <, > so user text can never contain a canonical token, then
//   2. rewrite resolvable @handles / #channels / @here|@channel|@everyone into
//      canonical tokens: <@u_000001>, <#c_000002>, <!here>.
// Everything downstream (notifications, previews, search) works on the
// canonical form and trusts that every token in it was produced here.

export interface MentionDirectory {
  userByHandle(handle: string): User | undefined;
  channelByName(name: string): Channel | undefined;
}

export interface ParsedText {
  text: string;
  mentions: Mention[];
}

const BROADCAST = new Set(["here", "channel", "everyone"]);

export function escapeText(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function unescapeText(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function parseMentions(raw: string, dir: MentionDirectory): ParsedText {
  let text = escapeText(raw);

  text = text.replace(/(^|[^\w@#&])@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)/gi, (whole, pre: string, handle: string) => {
    const h = handle.toLowerCase();
    if (BROADCAST.has(h)) return `${pre}<!${h}>`;
    const user = dir.userByHandle(h);
    return user ? `${pre}<@${user.id}>` : whole;
  });

  text = text.replace(/(^|[^\w@#&])#([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/gi, (whole, pre: string, name: string) => {
    const ch = dir.channelByName(name.toLowerCase());
    return ch && ch.kind === "public" ? `${pre}<#${ch.id}>` : whole;
  });

  return { text, mentions: extractMentions(text) };
}

/** Reads mentions back out of canonical text. Deduplicated, in first-seen order. */
export function extractMentions(text: string): Mention[] {
  const out: Mention[] = [];
  const seen = new Set<string>();
  const re = /<(@|#|!)([a-z0-9_]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = m[1] + m[2];
    if (seen.has(key)) continue;
    if (m[1] === "@") out.push({ kind: "user", userId: m[2] });
    else if (m[1] === "#") out.push({ kind: "channel", channelId: m[2] });
    else if (BROADCAST.has(m[2])) out.push({ kind: "broadcast", scope: m[2] as "here" | "channel" | "everyone" });
    else continue;
    seen.add(key);
  }
  return out;
}

export function hasBroadcast(mentions: Mention[]): boolean {
  return mentions.some((m) => m.kind === "broadcast");
}
