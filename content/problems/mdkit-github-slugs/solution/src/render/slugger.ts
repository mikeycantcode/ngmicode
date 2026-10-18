// Heading slugs for anchors and the table of contents.
//
// slugify() follows GitHub's algorithm (github-slugger) so that links copied
// from GitHub's rendering of our READMEs keep working.

// Everything except letters, combining marks, numbers, connector punctuation
// (`_` and friends), `-` and whitespace is removed.
const REMOVE = /[^\p{L}\p{M}\p{N}\p{Pc}\-\s]/gu;

/**
 * GitHub-compatible slug: trim, lower-case, drop disallowed characters, then
 * turn every whitespace character into `-` (no collapsing, no edge trimming).
 */
export function slugify(text: string): string {
  return text.trim().toLowerCase().replace(REMOVE, "").replace(/\s/g, "-");
}

/**
 * Produces unique slugs within one document. "Intro", "Intro" -> "intro",
 * "intro-1". A literal "Intro 1" heading later still gets a unique id.
 */
export class Slugger {
  /** slug -> highest numeric suffix handed out for it as a base. */
  private readonly seen = new Map<string, number>();

  slug(text: string): string {
    const base = slugify(text) || "section";
    let candidate = base;
    if (this.seen.has(base)) {
      let n = this.seen.get(base)!;
      do {
        n++;
        candidate = `${base}-${n}`;
      } while (this.seen.has(candidate));
      this.seen.set(base, n);
    }
    this.seen.set(candidate, 0);
    return candidate;
  }

  reset(): void {
    this.seen.clear();
  }
}
