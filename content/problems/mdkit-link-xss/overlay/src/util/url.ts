// URL normalization and the "is this safe to put in an href/src" check.
//
// Security model: link destinations are fully decoded at parse time (backslash
// escapes and entities, see inline/links.ts), so by the time a URL reaches the
// renderer it is exactly what the browser would see. The renderer then calls
// `isSafeUrl` on that decoded value.

/**
 * Returns false for URLs that would execute script when clicked/loaded.
 * Only javascript: URLs can run code; everything else (http, mailto, data
 * images, relative paths) is inert in an href/src.
 */
export function isSafeUrl(url: string): boolean {
  return !url.trim().startsWith("javascript:");
}

const HEX = "0123456789ABCDEF";

/**
 * Percent-encodes characters that are not allowed in a URL, leaving existing
 * %XX escapes and reserved characters alone. Spaces become %20.
 */
export function encodeUrl(url: string): string {
  let out = "";
  for (let i = 0; i < url.length; i++) {
    const ch = url[i];
    const code = url.charCodeAt(i);
    if (ch === "%" && /^[0-9a-fA-F]{2}$/.test(url.slice(i + 1, i + 3))) {
      out += ch;
      continue;
    }
    if (/[A-Za-z0-9;\/?:@&=+$,\-_.!~*'()#\[\]]/.test(ch)) {
      out += ch;
      continue;
    }
    if (code < 0x80) {
      out += "%" + HEX[code >> 4] + HEX[code & 15];
      continue;
    }
    // Non-ASCII: encode as UTF-8 (handles surrogate pairs).
    const cp = url.codePointAt(i)!;
    const chars = String.fromCodePoint(cp);
    out += encodeURIComponent(chars);
    if (cp > 0xffff) i++;
  }
  return out;
}

/** True for absolute http(s) URLs. */
export function isAbsoluteHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function hostOf(url: string): string | null {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}
