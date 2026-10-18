// Small inline rules: backslash escapes, code spans, autolinks, inline HTML,
// entities and line breaks. Each returns true if it consumed input.

import { decodeEntityMatch, ENTITY_RE } from "../util/entities";
import { isAsciiPunct } from "../util/strings";
import { encodeUrl } from "../util/url";
import type { InlineState } from "./state";

export function escape(state: InlineState): boolean {
  const { src } = state;
  const next = src[state.pos + 1];
  if (next === "\n") {
    state.flush();
    state.append({ type: "break" });
    state.pos += 2;
    skipLeadingSpaces(state);
    return true;
  }
  if (next !== undefined && isAsciiPunct(next)) {
    state.pending += next;
    state.pos += 2;
    return true;
  }
  state.pending += "\\";
  state.pos++;
  return true;
}

export function codeSpan(state: InlineState): boolean {
  const { src } = state;
  const start = state.pos;
  let i = start;
  while (src[i] === "`") i++;
  const len = i - start;

  const knownMiss = state.backtickMisses.get(len);
  if (knownMiss === undefined || knownMiss > i) {
    // Look for a closing run of exactly `len` backticks.
    let j = i;
    while (j < src.length) {
      const k = src.indexOf("`", j);
      if (k === -1) break;
      let e = k;
      while (src[e] === "`") e++;
      if (e - k === len) {
        let value = src.slice(i, k).replace(/\n/g, " ");
        if (value.length > 2 && value[0] === " " && value[value.length - 1] === " " && /[^ ]/.test(value)) {
          value = value.slice(1, -1);
        }
        state.flush();
        state.append({ type: "inlineCode", value });
        state.pos = e;
        return true;
      }
      j = e;
    }
    // Nothing closes a run of this length from offset i onwards.
    state.backtickMisses.set(len, i);
  }
  state.pending += src.slice(start, i);
  state.pos = i;
  return true;
}

const AUTOLINK_URL = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\u0000-\u0020]*)>/;
const AUTOLINK_EMAIL =
  /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;
const HTML_INLINE =
  /^<(?:[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^"'=<>`\u0000-\u0020]+|'[^']*'|"[^"]*"))?)*\s*\/?>|\/[A-Za-z][A-Za-z0-9-]*\s*>|!--[\s\S]*?-->)/;

export function angle(state: InlineState): boolean {
  const rest = state.src.slice(state.pos, state.pos + 2048);
  let m = AUTOLINK_URL.exec(rest);
  if (m) {
    state.flush();
    state.append({ type: "link", href: encodeUrl(m[1]), title: null, autolink: true, children: [{ type: "text", value: m[1] }] });
    state.pos += m[0].length;
    return true;
  }
  m = AUTOLINK_EMAIL.exec(rest);
  if (m) {
    state.flush();
    state.append({
      type: "link",
      href: "mailto:" + encodeUrl(m[1]),
      title: null,
      autolink: true,
      children: [{ type: "text", value: m[1] }],
    });
    state.pos += m[0].length;
    return true;
  }
  if (state.options.html) {
    m = HTML_INLINE.exec(rest);
    if (m) {
      state.flush();
      state.append({ type: "htmlInline", value: m[0] });
      state.pos += m[0].length;
      return true;
    }
  }
  state.pending += "<";
  state.pos++;
  return true;
}

const ENTITY_STICKY = new RegExp(ENTITY_RE.source, "y");

export function entity(state: InlineState): boolean {
  ENTITY_STICKY.lastIndex = state.pos;
  const m = ENTITY_STICKY.exec(state.src);
  const decoded = m ? decodeEntityMatch(m) : null;
  if (m && decoded !== null) {
    state.pending += decoded;
    state.pos += m[0].length;
  } else {
    state.pending += "&";
    state.pos++;
  }
  return true;
}

function skipLeadingSpaces(state: InlineState): void {
  while (state.src[state.pos] === " " || state.src[state.pos] === "\t") state.pos++;
}

export function newline(state: InlineState): boolean {
  // Two or more trailing spaces before the newline make a hard break.
  // Counted by hand: a `/ +$/` regex here is a well-known ReDoS.
  const p = state.pending;
  let end = p.length;
  while (end > 0 && (p[end - 1] === " " || p[end - 1] === "\t")) end--;
  const hard = p.length - end >= 2 && p[p.length - 1] === " " && p[p.length - 2] === " ";
  state.pending = p.slice(0, end);
  state.flush();
  state.append({ type: hard ? "break" : "softbreak" });
  state.pos++;
  skipLeadingSpaces(state);
  return true;
}
