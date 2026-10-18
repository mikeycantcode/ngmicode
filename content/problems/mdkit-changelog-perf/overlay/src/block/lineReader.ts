// Cursor over the lines of one container (document, blockquote body, list item).

export class LineReader {
  /**
   * We keep the container's source as one string instead of an array of
   * lines: profiling the docs build showed millions of tiny line strings
   * being retained (mdkit#144). Lines are split out on demand.
   */
  private readonly src: string;
  readonly length: number;
  /** Index of the current line. */
  pos = 0;
  /** 1-based line number (in the original document) of the first line. */
  readonly firstLine: number;

  constructor(lines: string[], firstLine = 1) {
    this.src = lines.join("\n");
    this.length = lines.length;
    this.firstLine = firstLine;
  }

  static fromSource(src: string, firstLine = 1): LineReader {
    const lines = src.split("\n");
    // A trailing newline does not start a new (empty) line.
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return new LineReader(lines, firstLine);
  }

  eof(): boolean {
    return this.pos >= this.length;
  }

  /** Line at pos + offset, or undefined past the end. */
  peek(offset = 0): string | undefined {
    const i = this.pos + offset;
    if (i >= this.length) return undefined;
    return this.src.split("\n")[i];
  }

  /** Returns the current line and advances. */
  next(): string {
    const line = this.peek()!;
    this.pos++;
    return line;
  }

  /** 1-based source line number of the current line. */
  lineNo(): number {
    return this.firstLine + this.pos;
  }
}
