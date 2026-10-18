// SUBSCRIBE / UNSUBSCRIBE / PSUBSCRIBE / PUNSUBSCRIBE / PUBLISH.
//
// Subscription replies are one [kind, name, subscriptionCount] triple per
// channel, returned together as an array. Messages arrive in the session's
// inbox (session.drain() / session.onMessage()).

import type { CommandSpec, Reply } from "../types";

export const pubsubCommands: CommandSpec[] = [
  {
    name: "SUBSCRIBE",
    arity: -2,
    flags: ["pubsub"],
    handler: (ctx, channels) =>
      channels.map((ch): Reply => {
        ctx.store.broker.subscribe(ctx.session, ch);
        return ["subscribe", ch, ctx.session.subscriptionCount];
      }),
  },
  {
    name: "UNSUBSCRIBE",
    arity: -1,
    flags: ["pubsub"],
    handler: (ctx, channels) => {
      const targets = channels.length ? channels : [...ctx.session.channels].sort();
      return targets.map((ch): Reply => {
        ctx.store.broker.unsubscribe(ctx.session, ch);
        return ["unsubscribe", ch, ctx.session.subscriptionCount];
      });
    },
  },
  {
    name: "PSUBSCRIBE",
    arity: -2,
    flags: ["pubsub"],
    handler: (ctx, patterns) =>
      patterns.map((p): Reply => {
        ctx.store.broker.psubscribe(ctx.session, p);
        return ["psubscribe", p, ctx.session.subscriptionCount];
      }),
  },
  {
    name: "PUNSUBSCRIBE",
    arity: -1,
    flags: ["pubsub"],
    handler: (ctx, patterns) => {
      const targets = patterns.length ? patterns : [...ctx.session.patterns].sort();
      return targets.map((p): Reply => {
        ctx.store.broker.punsubscribe(ctx.session, p);
        return ["punsubscribe", p, ctx.session.subscriptionCount];
      });
    },
  },
  {
    name: "PUBLISH",
    arity: 3,
    flags: ["pubsub", "fast"],
    handler: (ctx, [channel, payload]) => ctx.store.broker.publish(channel, payload),
  },
];
