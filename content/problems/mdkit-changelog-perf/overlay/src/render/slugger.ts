// Heading slugs for anchors and the table of contents.
//
// NOTE: this is *not* GitHub-compatible yet: non-ASCII letters are dropped
// and runs of dashes are collapsed (legacy behaviour from the docs-site days;
// some customers deep-link to these ids, so changing it is a breaking change).

/** Lower-cases and strips everything except [a-z0-9], spaces, `-` and `_`. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Produces unique slugs within one document. "Intro", "Intro" -> "intro",
 * "intro-1". A literal "Intro 1" heading later still gets a unique id.
 */
export class Slugger {
  /** Every slug handed out so far, in order. */
  private used: string[] = [];

  slug(text: string): string {
    const base = slugify(text) || "section";
    let candidate = base;
    let n = 0;
    while (this.used.includes(candidate)) {
      n++;
      candidate = `${base}-${n}`;
    }
    this.used.push(candidate);
    return candidate;
  }

  reset(): void {
    this.used = [];
  }
}
