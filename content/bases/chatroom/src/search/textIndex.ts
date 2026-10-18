import { unescapeText } from "../domain/mentions";

const STOPWORDS = new Set(["a", "an", "and", "the", "of", "to", "in", "is", "it", "on", "for", "at"]);

/**
 * Splits canonical message text into index terms: lowercased alphanumeric
 * runs, minus stopwords and single characters. Mention tokens (<@u_1>) are
 * dropped — search by person uses the `from:` filter instead.
 */
export function tokenize(text: string): string[] {
  const plain = unescapeText(text.replace(/<[@#!][a-z0-9_]+>/g, " ")).toLowerCase();
  const out: string[] = [];
  for (const raw of plain.split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    out.push(raw);
  }
  return out;
}

export interface ParsedQuery {
  terms: string[];
  fromHandle?: string;
  inChannel?: string;
}

/** Parses `deploy failed from:@alice in:#ops` style queries. */
export function parseQuery(q: string): ParsedQuery {
  const parsed: ParsedQuery = { terms: [] };
  const rest: string[] = [];
  for (const part of q.trim().split(/\s+/)) {
    const lower = part.toLowerCase();
    if (lower.startsWith("from:")) parsed.fromHandle = lower.slice(5).replace(/^@/, "");
    else if (lower.startsWith("in:")) parsed.inChannel = lower.slice(3).replace(/^#/, "");
    else rest.push(part);
  }
  parsed.terms = tokenize(rest.join(" "));
  return parsed;
}

// ---- inverted index ----

// term -> doc ids, with a reverse map so updates/deletes can unindex cleanly.

export class InvertedIndex {
  private postings = new Map<string, Set<string>>();
  private docs = new Map<string, string[]>();

  get docCount(): number {
    return this.docs.size;
  }

  upsert(docId: string, terms: string[]): void {
    this.remove(docId);
    const unique = [...new Set(terms)];
    this.docs.set(docId, unique);
    for (const t of unique) {
      let set = this.postings.get(t);
      if (!set) {
        set = new Set();
        this.postings.set(t, set);
      }
      set.add(docId);
    }
  }

  remove(docId: string): void {
    const terms = this.docs.get(docId);
    if (!terms) return;
    for (const t of terms) {
      const set = this.postings.get(t);
      if (!set) continue;
      set.delete(docId);
      if (set.size === 0) this.postings.delete(t);
    }
    this.docs.delete(docId);
  }

  /** Doc ids containing every term. Prefix match on the last term (search-as-you-type). */
  query(terms: string[]): Set<string> {
    if (!terms.length) return new Set();
    let result: Set<string> | null = null;
    terms.forEach((term, i) => {
      const matches = i === terms.length - 1 ? this.prefix(term) : this.postings.get(term) ?? new Set<string>();
      result = result === null ? new Set(matches) : new Set([...result].filter((id) => matches.has(id)));
    });
    return result ?? new Set();
  }

  private prefix(p: string): Set<string> {
    const out = new Set<string>();
    for (const [term, ids] of this.postings) if (term.startsWith(p)) for (const id of ids) out.add(id);
    return out;
  }
}
