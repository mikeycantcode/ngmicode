import { describe, it, expect } from "testkit";
import { parseCron, nextRun, upcomingRuns } from "../src/scheduler/cron";
import { CronParseError } from "../src/core/errors";

const iso = (t: number) => new Date(t).toISOString().slice(0, 16);

describe("cron", () => {
  it("parses lists, ranges and steps", () => {
    const s = parseCron("0,30 9-17/4 * * 1-5");
    expect([...s.minutes]).toEqual([0, 30]);
    expect([...s.hours]).toEqual([9, 13, 17]);
    expect(s.daysOfMonth.size).toBe(31);
    expect([...s.daysOfWeek]).toEqual([1, 2, 3, 4, 5]);
    expect([...parseCron("5/20 * * * *").minutes]).toEqual([5, 25, 45]);
  });

  it("expands macros", () => {
    expect(iso(nextRun(parseCron("@daily"), Date.UTC(2024, 1, 28, 12)))).toBe("2024-02-29T00:00");
    expect(iso(nextRun(parseCron("@weekly"), Date.UTC(2024, 0, 1)))).toBe("2024-01-07T00:00");
  });

  it("finds the next run strictly after the given time", () => {
    const s = parseCron("30 2 * * *");
    expect(iso(nextRun(s, Date.UTC(2024, 0, 1, 2, 30)))).toBe("2024-01-02T02:30");
    expect(iso(nextRun(s, Date.UTC(2024, 0, 1, 2, 29, 59)))).toBe("2024-01-01T02:30");
  });

  it("rolls over months and years", () => {
    expect(upcomingRuns("0 0 31 * *", Date.UTC(2024, 0, 31, 1), 3).map(iso)).toEqual([
      "2024-03-31T00:00",
      "2024-05-31T00:00",
      "2024-07-31T00:00",
    ]);
    expect(iso(nextRun(parseCron("0 0 1 1 *"), Date.UTC(2024, 5, 1)))).toBe("2025-01-01T00:00");
  });

  it("ORs the day fields when both are restricted", () => {
    // the 13th OR any Friday
    expect(upcomingRuns("0 0 13 * 5", Date.UTC(2024, 0, 1), 3).map(iso)).toEqual([
      "2024-01-05T00:00",
      "2024-01-12T00:00",
      "2024-01-13T00:00",
    ]);
  });

  it("accepts 7 and names for Sunday", () => {
    expect([...parseCron("0 0 * * 7").daysOfWeek]).toEqual([0]);
    expect([...parseCron("0 0 * * mon-FRI").daysOfWeek]).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects bad expressions", () => {
    expect(() => parseCron("* * * *")).toThrow(CronParseError);
    expect(() => parseCron("60 * * * *")).toThrow("out of range");
    expect(() => parseCron("*/0 * * * *")).toThrow("bad step");
    expect(() => parseCron("5-1 * * * *")).toThrow("backwards");
    expect(() => parseCron("* * * * 8")).toThrow(CronParseError);
  });
});
