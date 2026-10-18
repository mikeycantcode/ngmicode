// A deliberately small named-entity table. The full HTML5 table is ~2,200
// entries; these cover everything we have seen in real docs so far.
// TODO(mdkit#41): generate the full table at build time.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“",
  rdquo: "”", middot: "·", times: "×", divide: "÷", deg: "°", plusmn: "±", para: "¶", sect: "§",
  euro: "€", pound: "£", yen: "¥", cent: "¢", larr: "←", rarr: "→", uarr: "↑", darr: "↓",
  check: "✓", colon: ":", Tab: "\t", NewLine: "\n",
};

export const ENTITY_RE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/;
const ENTITY_RE_G = new RegExp(ENTITY_RE.source, "g");

function fromCodePoint(cp: number): string | null {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "\ufffd";
  return String.fromCodePoint(cp);
}

/** Decodes a single entity match (as produced by ENTITY_RE) or returns null. */
export function decodeEntityMatch(m: RegExpExecArray | RegExpMatchArray): string | null {
  if (m[1]) return fromCodePoint(parseInt(m[1], 16));
  if (m[2]) return fromCodePoint(parseInt(m[2], 10));
  if (m[3] && Object.prototype.hasOwnProperty.call(NAMED, m[3])) return NAMED[m[3]];
  return null;
}

/** Decodes every recognised entity in `s`; unknown entities are left as-is. */
export function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(ENTITY_RE_G, (...args) => {
    const decoded = decodeEntityMatch(args as unknown as RegExpMatchArray);
    return decoded ?? args[0];
  });
}
