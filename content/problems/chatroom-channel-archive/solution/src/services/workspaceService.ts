import { canAssignRole, type Channel, type Role, type User, type Workspace, type WorkspaceMember } from "../domain/types";
import type { AccessService } from "../policy/access";
import { canInviteToWorkspace } from "../policy/permissions";
import { memberKey, type Db } from "../storage/db";
import type { Clock, IdGenerator } from "../util/clock";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../util/errors";
import type { EventBus } from "../util/events";

export class WorkspaceService {
  private db: Db;
  private ids: IdGenerator;
  private clock: Clock;
  private bus: EventBus;
  private access: AccessService;

  constructor(deps: { db: Db; ids: IdGenerator; clock: Clock; bus: EventBus; access: AccessService }) {
    this.db = deps.db;
    this.ids = deps.ids;
    this.clock = deps.clock;
    this.bus = deps.bus;
    this.access = deps.access;
  }

  /** Creates a workspace owned by `ownerId`, with a #general channel everyone joins. */
  create(ownerId: string, name: string): Workspace {
    if (!this.db.users.has(ownerId)) throw new NotFoundError("user not found");
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 64) throw new ValidationError("workspace name must be 1-64 characters", "name");
    const now = this.clock.now();
    const wsId = this.ids.next("w");
    const general: Channel = {
      id: this.ids.next("c"),
      workspaceId: wsId,
      name: "general",
      kind: "public",
      topic: "Company-wide announcements and chatter",
      createdBy: ownerId,
      createdAt: now,
      isGeneral: true,
      archivedAt: null,
    };
    const ws: Workspace = { id: wsId, name: trimmed, ownerId, generalChannelId: general.id, createdAt: now };
    this.db.workspaces.insert(ws.id, ws);
    this.db.workspaceMembers.insert(memberKey(wsId, ownerId), { workspaceId: wsId, userId: ownerId, role: "owner", joinedAt: now });
    this.db.channels.insert(general.id, general);
    this.bus.emit({ type: "channel.created", channel: general });
    this.joinChannel(general.id, ownerId);
    return ws;
  }

  get(workspaceId: string): Workspace {
    const ws = this.db.workspaces.get(workspaceId);
    if (!ws) throw new NotFoundError("workspace not found");
    return ws;
  }

  addMember(actorId: string, workspaceId: string, userId: string, role: Role = "member"): WorkspaceMember {
    const ws = this.get(workspaceId);
    const actor = this.access.actor(workspaceId, actorId);
    if (!canInviteToWorkspace(actor)) throw new ForbiddenError("only admins can add workspace members");
    if (role === "owner") throw new ValidationError("cannot add a second owner", "role");
    if (!this.db.users.has(userId)) throw new NotFoundError("user not found");
    if (this.db.workspaceMembers.has(memberKey(workspaceId, userId))) throw new ConflictError("already a member");
    const member: WorkspaceMember = { workspaceId, userId, role, joinedAt: this.clock.now() };
    this.db.workspaceMembers.insert(memberKey(workspaceId, userId), member);
    // Guests are single/multi-channel guests: they do NOT get #general.
    if (role !== "guest") this.joinChannel(ws.generalChannelId, userId);
    return member;
  }

  setRole(actorId: string, workspaceId: string, userId: string, role: Role): WorkspaceMember {
    const actor = this.access.actor(workspaceId, actorId);
    const key = memberKey(workspaceId, userId);
    const current = this.db.workspaceMembers.get(key);
    if (!current) throw new NotFoundError("member not found");
    if (!canAssignRole(actor.role, current.role, role)) throw new ForbiddenError("cannot assign that role");
    return this.db.workspaceMembers.update(key, { role });
  }

  members(workspaceId: string): WorkspaceMember[] {
    return this.db.workspaceMembers.filter((m) => m.workspaceId === workspaceId);
  }

  private joinChannel(channelId: string, userId: string): void {
    const key = memberKey(channelId, userId);
    if (this.db.channelMembers.has(key)) return;
    this.db.channelMembers.insert(key, { channelId, userId, joinedAt: this.clock.now() });
    this.bus.emit({ type: "channel.member_joined", channelId, userId });
  }
}

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/;
const RESERVED_HANDLES = new Set(["here", "channel", "everyone", "admin", "steercode"]);

export interface CreateUserInput {
  handle: string;
  displayName?: string;
  isBot?: boolean;
}

export class UserService {
  private db: Db;
  private ids: IdGenerator;
  private clock: Clock;

  constructor(db: Db, ids: IdGenerator, clock: Clock) {
    this.db = db;
    this.ids = ids;
    this.clock = clock;
  }

  create(input: CreateUserInput): User {
    const handle = input.handle.trim().toLowerCase();
    if (!HANDLE_RE.test(handle)) throw new ValidationError("invalid handle", "handle");
    if (RESERVED_HANDLES.has(handle)) throw new ValidationError(`"${handle}" is reserved`, "handle");
    if (this.byHandle(handle)) throw new ConflictError("handle already taken");
    const user: User = {
      id: this.ids.next("u"),
      handle,
      displayName: (input.displayName ?? handle).trim() || handle,
      isBot: input.isBot ?? false,
      createdAt: this.clock.now(),
    };
    return this.db.users.insert(user.id, user);
  }

  get(id: string): User {
    const u = this.db.users.get(id);
    if (!u) throw new NotFoundError("user not found");
    return u;
  }

  byHandle(handle: string): User | undefined {
    const h = handle.toLowerCase();
    return this.db.users.find((u) => u.handle === h);
  }

  rename(id: string, displayName: string): User {
    this.get(id);
    const name = displayName.trim();
    if (!name || name.length > 80) throw new ValidationError("displayName must be 1-80 characters", "displayName");
    return this.db.users.update(id, { displayName: name });
  }
}
