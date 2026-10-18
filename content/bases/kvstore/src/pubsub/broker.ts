// Client-facing pub/sub. Fire-and-forget: messages are delivered
// synchronously to subscribed sessions' inboxes and are never persisted.

import type { Session } from "../server/session";
import { patternMatch } from "./pattern";

export class Broker {
  private channels = new Map<string, Set<Session>>();
  private patterns = new Map<string, Set<Session>>();

  subscribe(session: Session, channel: string): void {
    add(this.channels, channel, session);
    session.channels.add(channel);
  }

  unsubscribe(session: Session, channel: string): boolean {
    session.channels.delete(channel);
    return remove(this.channels, channel, session);
  }

  psubscribe(session: Session, pattern: string): void {
    add(this.patterns, pattern, session);
    session.patterns.add(pattern);
  }

  punsubscribe(session: Session, pattern: string): boolean {
    session.patterns.delete(pattern);
    return remove(this.patterns, pattern, session);
  }

  /** Returns the number of deliveries (a session matching twice counts twice, like Redis). */
  publish(channel: string, payload: string): number {
    let n = 0;
    for (const s of this.channels.get(channel) ?? []) {
      s.deliver({ kind: "message", channel, payload });
      n++;
    }
    for (const [pattern, sessions] of this.patterns) {
      if (!patternMatch(pattern, channel)) continue;
      for (const s of sessions) {
        s.deliver({ kind: "pmessage", pattern, channel, payload });
        n++;
      }
    }
    return n;
  }

  removeSession(session: Session): void {
    for (const ch of [...session.channels]) this.unsubscribe(session, ch);
    for (const p of [...session.patterns]) this.punsubscribe(session, p);
  }

  get channelCount(): number {
    return this.channels.size;
  }

  get patternCount(): number {
    return this.patterns.size;
  }
}

function add(map: Map<string, Set<Session>>, name: string, s: Session) {
  let set = map.get(name);
  if (!set) {
    set = new Set();
    map.set(name, set);
  }
  set.add(s);
}

function remove(map: Map<string, Set<Session>>, name: string, s: Session): boolean {
  const set = map.get(name);
  if (!set || !set.delete(s)) return false;
  if (set.size === 0) map.delete(name);
  return true;
}
