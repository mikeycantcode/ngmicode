import type { Clock, TimerHandle } from "../clock/clock";
import type { JobId } from "../core/types";
import type { Storage } from "../storage/storage";

export interface LockRenewal {
  stop(): void;
}

/**
 * Keep a job's lock alive while its handler runs by extending it every
 * `lockMs / 2`. If an extension fails (the job stalled and was re-claimed, or
 * was removed) `onLost` is called once and renewal stops.
 */
export function startLockRenewal(
  clock: Clock,
  storage: Storage,
  jobId: JobId,
  token: string,
  lockMs: number,
  onLost: () => void,
): LockRenewal {
  let timer: TimerHandle | undefined;
  let stopped = false;
  const interval = Math.max(1, Math.floor(lockMs / 2));

  const schedule = () => {
    timer = clock.setTimeout(async () => {
      if (stopped) return;
      const ok = await storage.extendLock(jobId, token, clock.now() + lockMs);
      if (stopped) return;
      if (!ok) {
        stopped = true;
        onLost();
        return;
      }
      schedule();
    }, interval);
  };
  schedule();

  return {
    stop() {
      stopped = true;
      clock.clearTimeout(timer);
    },
  };
}
