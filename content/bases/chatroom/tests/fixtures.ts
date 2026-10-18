import { createApp, type AppOptions } from "../src/app";
import { ManualClock } from "../src/util/clock";

/**
 * Standard world used across the test suite:
 *
 *   workspace "Acme"
 *     alice — owner        bob — admin
 *     carol — member       dave — member
 *     gus   — guest (only in #partners)
 *
 *   #general  (public, everyone except gus)
 *   #random   (public, carol only — others may join)
 *   #partners (public, carol + gus)
 *   #exec     (private, bob + alice)
 */
export function setup(opts: AppOptions = {}) {
  const clock = (opts.clock as ManualClock | undefined) ?? new ManualClock(1_700_000_000_000);
  const app = createApp({ ...opts, clock });
  const alice = app.users.create({ handle: "alice", displayName: "Alice Owner" });
  const bob = app.users.create({ handle: "bob", displayName: "Bob Admin" });
  const carol = app.users.create({ handle: "carol", displayName: "Carol" });
  const dave = app.users.create({ handle: "dave", displayName: "Dave" });
  const gus = app.users.create({ handle: "gus", displayName: "Gus Guest" });

  const ws = app.workspaces.create(alice.id, "Acme");
  app.workspaces.addMember(alice.id, ws.id, bob.id, "admin");
  app.workspaces.addMember(alice.id, ws.id, carol.id, "member");
  app.workspaces.addMember(alice.id, ws.id, dave.id, "member");
  app.workspaces.addMember(alice.id, ws.id, gus.id, "guest");

  const general = app.db.channels.get(ws.generalChannelId)!;
  const random = app.channels.create(carol.id, ws.id, { name: "random" });
  const partners = app.channels.create(carol.id, ws.id, { name: "partners" });
  app.channels.invite(carol.id, partners.id, gus.id);
  const exec = app.channels.create(bob.id, ws.id, { name: "exec", kind: "private" });
  app.channels.invite(bob.id, exec.id, alice.id);

  return { app, clock, ws, alice, bob, carol, dave, gus, general, random, partners, exec };
}

export type World = ReturnType<typeof setup>;

/** Lets queued async work (outbound queues, webhook flushes) run. */
export async function settle(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
