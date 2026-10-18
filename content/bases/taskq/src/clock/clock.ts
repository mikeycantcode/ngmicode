export interface TimerHandle {
  readonly id: number;
}

/**
 * All time in taskq flows through a Clock so tests can swap in FakeClock.
 * Never call Date.now() or the global setTimeout from library code.
 */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle | undefined): void;
}

export class SystemClock implements Clock {
  private handles = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  now(): number {
    return Date.now();
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.nextId++;
    const h = setTimeout(() => {
      this.handles.delete(id);
      fn();
    }, Math.max(0, ms));
    this.handles.set(id, h);
    return { id };
  }

  clearTimeout(handle: TimerHandle | undefined): void {
    if (!handle) return;
    const h = this.handles.get(handle.id);
    if (h !== undefined) {
      clearTimeout(h);
      this.handles.delete(handle.id);
    }
  }
}

/** Promise that resolves after `ms` on the given clock. */
export function sleep(clock: Clock, ms: number): Promise<void> {
  return new Promise((resolve) => {
    clock.setTimeout(resolve, ms);
  });
}
