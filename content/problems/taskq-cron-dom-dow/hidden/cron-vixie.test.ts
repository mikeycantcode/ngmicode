import { it, expect } from "testkit";
import { parseCron, upcomingRuns } from "../../src/scheduler/cron";
import { CronParseError } from "../../src/core/errors";

const iso = (t: number) => new Date(t).toISOString().slice(0, 16);
const JAN1 = Date.UTC(2024, 0, 1);

it("ORs day-of-month and day-of-week when both are restricted", () => {
  expect(upcomingRuns("0 0 13 * 5", JAN1, 4).map(iso)).toEqual([
    "2024-01-05T00:00",
    "2024-01-12T00:00",
    "2024-01-13T00:00",
    "2024-01-19T00:00",
  ]);
  expect(upcomingRuns("0 0 1-7 * 1", JAN1, 3).map(iso)).toEqual(["2024-01-02T00:00", "2024-01-03T00:00", "2024-01-04T00:00"]);
});

it("treats a '*'-prefixed day field (including */n) as unrestricted, so both must match", () => {
  expect(upcomingRuns("0 0 */10 * 1", JAN1, 3).map(iso)).toEqual(["2024-03-11T00:00", "2024-04-01T00:00", "2024-07-01T00:00"]);
  expect(upcomingRuns("0 0 * * 1", JAN1, 2).map(iso)).toEqual(["2024-01-08T00:00", "2024-01-15T00:00"]);
});

it("accepts 7 as Sunday and month/day names, case-insensitive", () => {
  expect([...parseCron("0 9 * * 7").daysOfWeek]).toEqual([0]);
  expect([...parseCron("0 9 * * 5-7").daysOfWeek].sort()).toEqual([0, 5, 6]);
  expect([...parseCron("0 0 1 jan,Jul *").months]).toEqual([1, 7]);
  expect([...parseCron("0 0 * * Mon-FRI").daysOfWeek]).toEqual([1, 2, 3, 4, 5]);
  expect([...parseCron("0 0 * * */2").daysOfWeek]).toEqual([0, 2, 4, 6]);
  expect(upcomingRuns("30 6 * * 7", JAN1, 2).map(iso)).toEqual(["2024-01-07T06:30", "2024-01-14T06:30"]);
  expect(upcomingRuns("0 0 15 feb-mar sun", JAN1, 3).map(iso)).toEqual(["2024-02-04T00:00", "2024-02-11T00:00", "2024-02-15T00:00"]);
  expect(() => parseCron("0 0 * FOO *")).toThrow(CronParseError);
  expect(() => parseCron("0 0 * * 8")).toThrow(CronParseError);
  expect(() => parseCron("0 0 * * 0-8")).toThrow(CronParseError);
});
