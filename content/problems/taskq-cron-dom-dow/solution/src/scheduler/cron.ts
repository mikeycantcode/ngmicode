import { CronParseError, TaskqError } from "../core/errors";
import { err, ok, type Result } from "../core/result";

/**
 * Five-field cron expressions, evaluated in UTC:
 *
 *   ┌ minute        0-59
 *   │ ┌ hour        0-23
 *   │ │ ┌ day of month 1-31
 *   │ │ │ ┌ month   1-12
 *   │ │ │ │ ┌ day of week 0-7 (0 and 7 = Sunday)
 *   * * * * *
 *
 * Each field is a comma list of: `*`, `n`, `a-b`, `*\/s`, `a-b/s`, `a/s`
 * (`a/s` means a..max step s). Macros: @yearly @annually @monthly @weekly
 * @daily @midnight @hourly. Month and day-of-week accept three-letter names
 * (JAN-DEC, SUN-SAT, case-insensitive) anywhere a number is accepted.
 *
 * Day matching (Vixie semantics): if BOTH day fields are restricted — i.e.
 * neither field's text starts with `*` — a day matches when EITHER matches.
 * Otherwise both must match (so a `*`-prefixed field such as `*\/2` counts as
 * unrestricted).
 */
export interface CronSchedule {
  source: string;
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /** Field text started with `*`. */
  domStar: boolean;
  dowStar: boolean;
}

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
}

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const FIELDS: FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTH_NAMES },
  // 7 is accepted as an alias for Sunday; normalised to 0 below.
  { name: "day-of-week", min: 0, max: 7, names: DAY_NAMES },
];

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const MINUTE = 60_000;
const MAX_YEARS_AHEAD = 5;

export function parseCron(expression: string): CronSchedule {
  const source = expression.trim();
  const expanded = MACROS[source.toLowerCase()] ?? source;
  const parts = expanded.split(/\s+/).filter(Boolean);
  if (parts.length !== 5) throw new CronParseError(expression, `expected 5 fields, got ${parts.length}`);
  const sets = parts.map((p, i) => parseField(p, FIELDS[i], expression));
  return {
    source,
    minutes: sets[0],
    hours: sets[1],
    daysOfMonth: sets[2],
    months: sets[3],
    daysOfWeek: sets[4],
    domStar: parts[2].startsWith("*"),
    dowStar: parts[4].startsWith("*"),
  };
}

export function tryParseCron(expression: string): Result<CronSchedule, CronParseError> {
  try {
    return ok(parseCron(expression));
  } catch (e) {
    if (e instanceof CronParseError) return err(e);
    throw e;
  }
}

function parseNumber(text: string, field: FieldSpec, expr: string): number {
  if (field.names && /^[a-z]{3}$/i.test(text)) {
    const i = field.names.indexOf(text.toUpperCase());
    if (i === -1) throw new CronParseError(expr, `${field.name}: unknown name "${text}"`);
    return field.names === MONTH_NAMES ? i + 1 : i;
  }
  if (!/^\d+$/.test(text)) throw new CronParseError(expr, `${field.name}: "${text}" is not a number`);
  const n = Number(text);
  if (n < field.min || n > field.max) {
    throw new CronParseError(expr, `${field.name}: ${n} out of range ${field.min}-${field.max}`);
  }
  return n;
}

function parseField(text: string, field: FieldSpec, expr: string): Set<number> {
  const out = new Set<number>();
  for (const item of text.split(",")) {
    if (item === "") throw new CronParseError(expr, `${field.name}: empty list item`);
    const pieces = item.split("/");
    if (pieces.length > 2) throw new CronParseError(expr, `${field.name}: too many "/" in "${item}"`);
    const [rangeText, stepText] = pieces;
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1) throw new CronParseError(expr, `${field.name}: bad step "${stepText}"`);
      step = Number(stepText);
    }
    let lo: number;
    let hi: number;
    if (rangeText === "*") {
      lo = field.min;
      hi = field.names === DAY_NAMES ? 6 : field.max;
    } else if (rangeText.includes("-")) {
      const [a, b, ...rest] = rangeText.split("-");
      if (rest.length) throw new CronParseError(expr, `${field.name}: bad range "${rangeText}"`);
      lo = parseNumber(a, field, expr);
      hi = parseNumber(b, field, expr);
      if (lo > hi) throw new CronParseError(expr, `${field.name}: range ${lo}-${hi} is backwards`);
    } else {
      lo = parseNumber(rangeText, field, expr);
      hi = stepText !== undefined ? field.max : lo;
    }
    for (let v = lo; v <= hi; v += step) out.add(field.names === DAY_NAMES && v === 7 ? 0 : v);
  }
  return out;
}

function dayMatches(s: CronSchedule, d: Date): boolean {
  const dom = s.daysOfMonth.has(d.getUTCDate());
  const dow = s.daysOfWeek.has(d.getUTCDay());
  if (!s.domStar && !s.dowStar) return dom || dow;
  return dom && dow;
}

/** The first matching minute strictly after `afterMs` (epoch ms, UTC). */
export function nextRun(schedule: CronSchedule, afterMs: number): number {
  let t = Math.floor(afterMs / MINUTE) * MINUTE + MINUTE;
  const startYear = new Date(afterMs).getUTCFullYear();
  for (;;) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    if (y > startYear + MAX_YEARS_AHEAD) {
      throw new TaskqError(`cron "${schedule.source}" has no run within ${MAX_YEARS_AHEAD} years`, "CRON_NEVER");
    }
    const mo = d.getUTCMonth();
    const day = d.getUTCDate();
    const h = d.getUTCHours();
    if (!schedule.months.has(mo + 1)) {
      t = Date.UTC(y, mo + 1, 1, 0, 0);
      continue;
    }
    if (!dayMatches(schedule, d)) {
      t = Date.UTC(y, mo, day + 1, 0, 0);
      continue;
    }
    if (!schedule.hours.has(h)) {
      t = Date.UTC(y, mo, day, h + 1, 0);
      continue;
    }
    if (!schedule.minutes.has(d.getUTCMinutes())) {
      t += MINUTE;
      continue;
    }
    return t;
  }
}

/** Convenience: next `count` run times after `afterMs`. */
export function upcomingRuns(expression: string, afterMs: number, count: number): number[] {
  const s = parseCron(expression);
  const out: number[] = [];
  let t = afterMs;
  for (let i = 0; i < count; i++) {
    t = nextRun(s, t);
    out.push(t);
  }
  return out;
}
