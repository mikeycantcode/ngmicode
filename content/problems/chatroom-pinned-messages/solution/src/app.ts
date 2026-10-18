import { ALL_COMMANDS } from "./api/commands";
import { ApiRouter } from "./api/router";
import { mergeConfig, type ChatConfig, type DeepPartial } from "./config";
import { registerDeliveryBridge } from "./delivery/fanout";
import { FakeConnection } from "./delivery/fakeConnection";
import { Fanout } from "./delivery/fanout";
import { ConnectionHub } from "./delivery/hub";
import { IncomingWebhookService } from "./integrations/incomingWebhooks";
import { OutgoingWebhookDispatcher, type HttpTransport } from "./integrations/outgoingWebhooks";
import { AccessService } from "./policy/access";
import { RateLimiter } from "./ratelimit/rateLimiter";
import { SearchService } from "./search/searchService";
import { ChannelService } from "./services/channelService";
import { HistoryService } from "./services/historyService";
import { MessageService } from "./services/messageService";
import { PinService } from "./services/pinService";
import { NotificationService } from "./services/notificationService";
import { PresenceService } from "./services/presenceService";
import { ReactionService } from "./services/reactionService";
import { ThreadService } from "./services/threadService";
import { TypingService } from "./services/presenceService";
import { UserService } from "./services/workspaceService";
import { WorkspaceService } from "./services/workspaceService";
import { Db } from "./storage/db";
import { ManualClock, type Clock } from "./util/clock";
import { EventBus } from "./util/events";
import { IdGenerator } from "./util/clock";
import { MemoryLogger, type Logger } from "./util/common";

export interface AppOptions {
  clock?: Clock;
  config?: DeepPartial<ChatConfig>;
  transport?: HttpTransport;
  logger?: Logger;
}

const nullTransport: HttpTransport = { post: async () => ({ status: 200 }) };

/**
 * Composition root. Builds the whole in-process chat backend.
 *
 * Order matters a little: subscribers to the event bus run in registration
 * order, so search/notifications are indexed before the delivery bridge
 * pushes frames to clients.
 */
export function createApp(opts: AppOptions = {}) {
  const clock = opts.clock ?? new ManualClock();
  const config = mergeConfig(opts.config);
  const logger = opts.logger ?? new MemoryLogger();
  const db = new Db();
  const ids = new IdGenerator();
  const bus = new EventBus();
  const access = new AccessService(db);
  const hub = new ConnectionHub(logger);
  const fanout = new Fanout(db, hub);
  const limiter = new RateLimiter(config.rateLimits, clock);

  const users = new UserService(db, ids, clock);
  const workspaces = new WorkspaceService({ db, ids, clock, bus, access });
  const channels = new ChannelService({ db, ids, clock, bus, access });
  const messages = new MessageService({ db, ids, clock, bus, access, config });
  const threads = new ThreadService({ db, access });
  const reactions = new ReactionService({ db, bus, access });
  const history = new HistoryService({ db, access, config });
  const presence = new PresenceService({ clock, bus, config, isConnected: (u) => hub.isConnected(u) });
  const typing = new TypingService({ clock, bus, config, access });
  const search = new SearchService({ db, bus, access, config });
  const notifications = new NotificationService({ db, ids, clock, bus, config, access, presence, threads });
  const pins = new PinService({ db, clock, bus, access });
  const incomingWebhooks = new IncomingWebhookService({ db, ids, clock, access, users, messages, logger });
  const outgoingWebhooks = new OutgoingWebhookDispatcher({
    db,
    ids,
    clock,
    bus,
    access,
    config,
    transport: opts.transport ?? nullTransport,
  });

  hub.onChange((userId) => presence.connectionChanged(userId));
  registerDeliveryBridge(bus, db, fanout);

  const app = {
    clock,
    config,
    logger,
    db,
    ids,
    bus,
    access,
    hub,
    fanout,
    limiter,
    users,
    workspaces,
    channels,
    messages,
    threads,
    reactions,
    history,
    presence,
    typing,
    search,
    notifications,
    pins,
    incomingWebhooks,
    outgoingWebhooks,
    api: null as unknown as ApiRouter,

    /** Opens a fake client connection for `userId` (tests / simulator). */
    connect(userId: string, connOpts: { manual?: boolean } = {}): FakeConnection {
      const conn = new FakeConnection(ids.next("conn"), userId, connOpts);
      hub.register(conn);
      return conn;
    },

    /** Periodic housekeeping: presence sweep + outgoing webhook delivery. */
    async tick(): Promise<void> {
      presence.sweep();
      await outgoingWebhooks.flush();
    },
  };
  app.api = new ApiRouter({ app: app as App, limiter, logger });
  app.api.register(ALL_COMMANDS);
  return app;
}

export type App = ReturnType<typeof createApp>;
