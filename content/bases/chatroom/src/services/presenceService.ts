import type { PresenceStatus } from "../domain/types";
import type { AccessService } from "../policy/access";
import type { ChatConfig } from "../config";
import type { Clock } from "../util/clock";
import type { EventBus } from "../util/events";

// Presence is derived, not stored: a user is
//   offline — no open connections
//   away    — connected, but manually set away or idle for >= awayAfterMs
//   active  — otherwise
// sweep() recomputes and emits presence.changed for anyone whose status moved;
// the app calls it on a timer (tests call it directly after advancing the clock).

export class PresenceService {
  private clock: Clock;
  private bus: EventBus;
  private config: ChatConfig;
  private isConnected: (userId: string) => boolean;
  private lastActivity = new Map<string, number>();
  private manualAway = new Set<string>();
  private lastStatus = new Map<string, PresenceStatus>();

  constructor(deps: { clock: Clock; bus: EventBus; config: ChatConfig; isConnected: (userId: string) => boolean }) {
    this.clock = deps.clock;
    this.bus = deps.bus;
    this.config = deps.config;
    this.isConnected = deps.isConnected;
  }

  /** Any user activity (heartbeat, post, typing) counts. */
  touch(userId: string): void {
    this.lastActivity.set(userId, this.clock.now());
    this.refresh(userId);
  }

  setAway(userId: string, away: boolean): void {
    if (away) this.manualAway.add(userId);
    else this.manualAway.delete(userId);
    this.refresh(userId);
  }

  status(userId: string): PresenceStatus {
    if (!this.isConnected(userId)) return "offline";
    if (this.manualAway.has(userId)) return "away";
    const last = this.lastActivity.get(userId);
    if (last === undefined) return "away";
    return this.clock.now() - last >= this.config.presence.awayAfterMs ? "away" : "active";
  }

  lastActiveAt(userId: string): number | null {
    return this.lastActivity.get(userId) ?? null;
  }

  sweep(): void {
    const users = new Set([...this.lastActivity.keys(), ...this.lastStatus.keys(), ...this.manualAway]);
    for (const u of users) this.refresh(u);
  }

  /** Called by the hub when a user's connection set changes. */
  connectionChanged(userId: string): void {
    this.refresh(userId);
  }

  private refresh(userId: string): void {
    const next = this.status(userId);
    const prev = this.lastStatus.get(userId) ?? "offline";
    this.lastStatus.set(userId, next);
    if (next !== prev) this.bus.emit({ type: "presence.changed", userId, status: next });
  }
}

// Typing indicators. Clients call start() on keypress; we throttle the
// outgoing event to one per throttleMs per (user, channel) and expire
// indicators ttlMs after the last start(). Posting a message clears it.

export class TypingService {
  private clock: Clock;
  private bus: EventBus;
  private config: ChatConfig;
  private access: AccessService;
  private lastStart = new Map<string, number>(); // key -> last start() time
  private lastEmit = new Map<string, number>(); // key -> last emitted event time

  constructor(deps: { clock: Clock; bus: EventBus; config: ChatConfig; access: AccessService }) {
    this.clock = deps.clock;
    this.bus = deps.bus;
    this.config = deps.config;
    this.access = deps.access;
    this.bus.on("message.created", (e) => this.stop(e.message.authorId, e.message.channelId));
  }

  /** Returns true if a typing event was emitted (false when throttled). */
  start(actorId: string, channelId: string): boolean {
    this.access.assertPost(actorId, channelId);
    const key = `${channelId}:${actorId}`;
    const now = this.clock.now();
    this.lastStart.set(key, now);
    const emitted = this.lastEmit.get(key);
    if (emitted !== undefined && now - emitted < this.config.typing.throttleMs) return false;
    this.lastEmit.set(key, now);
    this.bus.emit({ type: "typing", channelId, userId: actorId, at: now });
    return true;
  }

  stop(userId: string, channelId: string): void {
    const key = `${channelId}:${userId}`;
    this.lastStart.delete(key);
    this.lastEmit.delete(key);
  }

  /** Users currently typing in the channel, in order of when they started. */
  active(channelId: string): string[] {
    const now = this.clock.now();
    const out: { userId: string; at: number }[] = [];
    for (const [key, at] of this.lastStart) {
      const [ch, userId] = key.split(":");
      if (ch !== channelId) continue;
      if (now - at < this.config.typing.ttlMs) out.push({ userId, at });
      else this.lastStart.delete(key);
    }
    return out.sort((a, b) => a.at - b.at).map((x) => x.userId);
  }
}
