import { describe, it, expect } from "testkit";
import { setup } from "./fixtures";
import { collectHistory, seedMessages } from "./helpers/seed";

describe("history pagination invariants", () => {
  for (const stepMs of [0, 1, 1000]) {
    for (const pageSize of [1, 2, 3, 5, 50]) {
      it(`each message exactly once, newest first (step ${stepMs}, page ${pageSize})`, () => {
        const { app, carol, general } = setup();
        const msgs = seedMessages(app, { channelId: general.id, authorId: carol.id, count: 9, stepMs });
        app.messages.delete(carol.id, msgs[4].id);
        const got = collectHistory(app, carol.id, general.id, pageSize).map((m) => m.id);
        expect(got).toEqual(msgs.filter((_, i) => i !== 4).reverse().map((m) => m.id));
      });
    }
  }
});
