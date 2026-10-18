// A tiny AbortController look-alike. We can't rely on the DOM/Node one in
// every runtime we ship to, and we want deterministic listener ordering.

export class CancelSignal {
  private _aborted = false;
  private _reason: unknown;
  private listeners: ((reason: unknown) => void)[] = [];

  get aborted(): boolean {
    return this._aborted;
  }

  get reason(): unknown {
    return this._reason;
  }

  /** Register a listener; runs immediately if already aborted. Returns an unsubscribe fn. */
  onAbort(fn: (reason: unknown) => void): () => void {
    if (this._aborted) {
      fn(this._reason);
      return () => {};
    }
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  throwIfAborted(): void {
    if (this._aborted) throw this._reason instanceof Error ? this._reason : new Error(String(this._reason ?? "aborted"));
  }

  /** @internal */
  _fire(reason: unknown): void {
    if (this._aborted) return;
    this._aborted = true;
    this._reason = reason;
    const ls = this.listeners;
    this.listeners = [];
    for (const l of ls) {
      try {
        l(reason);
      } catch {
        // listeners must not break cancellation
      }
    }
  }
}

export class CancelController {
  readonly signal = new CancelSignal();

  cancel(reason?: unknown): void {
    this.signal._fire(reason ?? new Error("cancelled"));
  }
}
