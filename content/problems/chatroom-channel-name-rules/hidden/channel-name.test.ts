import { it, expect } from "testkit";
import { normalizeChannelName } from "../../src/domain/channelName";
import { setup } from "../fixtures";

it("applies the character rules in order", () => {
  expect(normalizeChannelName("  Design_Team.Q3 ")).toBe("design-team-q3");
  expect(normalizeChannelName("a - b")).toBe("a-b");
  expect(normalizeChannelName("Café Ops!")).toBe("caf-ops");
  expect(normalizeChannelName("__ops__")).toBe("ops");
  expect(normalizeChannelName("a . _ b")).toBe("a-b");
  expect(normalizeChannelName("--x--")).toBe("x");
});

it("truncates to 80 and never leaves a trailing hyphen", () => {
  const a79 = "a".repeat(79);
  expect(normalizeChannelName(a79 + " bcd")).toBe(a79);
  expect(normalizeChannelName("b".repeat(100))).toBe("b".repeat(80));
});

it("rejects empty and reserved names after normalization", () => {
  expect(() => normalizeChannelName("!!!")).toThrow("channel name must contain a letter or digit");
  expect(() => normalizeChannelName(" -- ")).toThrow("channel name must contain a letter or digit");
  expect(() => normalizeChannelName("@Here")).toThrow('"here" is a reserved name');
  expect(() => normalizeChannelName(" Everyone. ")).toThrow('"everyone" is a reserved name');
  const { app, ws, carol } = setup();
  expect(() => app.channels.create(carol.id, ws.id, { name: "#channel" })).toThrow('"channel" is a reserved name');
});
