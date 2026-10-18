// Cursor over the lines of one container (document, blockquote body, list item).

export class LineReader {
  readonly lines: string[];
  /** Index of the current line within `lines`. */
  pos = 0;
  /** 1-based line number (in the original document) of `lines[0]`. */
  readonly firstLine: number;

  constructor(lines: string[], firstLine = 1) {
    this.lines = lines;
    this.firstLine = firstLine;
  }

  static fromSource(src: string, firstLine = 1): LineReader {
    const lines = src.split("\n");
    // A trailing newline does not start a new (empty) line.
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return new LineReader(lines, firstLine);
  }

  eof(): boolean {
    return this.pos >= this.lines.length;
  }

  /** Line at pos + offset, or undefined past the end. */
  peek(offset = 0): string | undefined {
    return this.lines[this.pos + offset];
  }

  /** Returns the current line and advances. */
  next(): string {
    const line = this.lines[this.pos];
    this.pos++;
    return line;
  }

  /** 1-based source line number of the current line. */
  lineNo(): number {
    return this.firstLine + this.pos;
  }

  get length(): number {
    return this.lines.length;
  }
}
