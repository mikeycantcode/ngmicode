import type { Message } from "../domain/types";
import type { AccessService } from "../policy/access";
import type { Db } from "../storage/db";
import { ValidationError } from "../util/errors";

export interface ThreadView {
  parent: Message;
  replies: Message[]; // oldest first
}

export class ThreadService {
  private db: Db;
  private access: AccessService;

  constructor(deps: { db: Db; access: AccessService }) {
    this.db = deps.db;
    this.access = deps.access;
  }

  getThread(actorId: string, parentId: string): ThreadView {
    const parent = this.access.message(parentId);
    this.access.assertRead(actorId, parent.channelId);
    if (parent.parentId !== null) throw new ValidationError("not a thread parent", "parentId");
    const replies: Message[] = [];
    for (const pos of this.db.timeline.thread(parentId)) {
      const m = this.db.messages.get(pos.id);
      if (m && m.deletedAt === null) replies.push(m);
    }
    return { parent, replies };
  }

  /** Users who have replied in the thread, in order of first reply. */
  participants(parentId: string): string[] {
    const seen: string[] = [];
    for (const pos of this.db.timeline.thread(parentId)) {
      const m = this.db.messages.get(pos.id);
      if (m && m.deletedAt === null && !seen.includes(m.authorId)) seen.push(m.authorId);
    }
    return seen;
  }
}
