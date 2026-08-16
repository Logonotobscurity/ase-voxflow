import { PlatformError } from './errors';

/**
 * Deterministic 5-field cron matcher for the Orcflo schedule trigger.
 *
 * Supports the classic vixie-cron 5-field form:
 *
 *   minute (0-59) hour (0-23) day-of-month (1-31) month (1-12) day-of-week (0-6, Sunday = 0)
 *
 * Field syntax: `*`, `*`-slash-`n` steps, `a`, `a-b`, `a-b/n`, and comma lists.
 * When both day-of-month and day-of-week are restricted, a day matches
 * when EITHER field matches (vixie cron OR semantics).
 *
 * Timezone support is deliberately bounded to UTC and fixed offsets
 * (`+HH:MM` / `-HH:MM`). No DST/IANA database is bundled, so a DST
 * zone string is rejected rather than silently miscomputed.
 *
 * Everything here is pure and deterministic: same inputs, same results.
 * It is the only scheduling authority; the Orcflo trigger service never
 * consults wall-clock state outside the values passed to these functions.
 */

export type ParsedCron = {
  minute: number[];
  hour: number[];
  dom: number[];
  month: number[];
  dow: number[];
};

const FIELD_RANGES = {
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 6],
} as const;

type CronFieldName = keyof typeof FIELD_RANGES;

export function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new PlatformError('VALIDATION_ERROR', `Cron expression must have exactly 5 fields; received ${fields.length}.`);
  }
  const names: CronFieldName[] = ['minute', 'hour', 'dom', 'month', 'dow'];
  const parsed: ParsedCron = { minute: [], hour: [], dom: [], month: [], dow: [] };
  fields.forEach((field, index) => {
    const name = names[index];
    const [min, max] = FIELD_RANGES[name];
    parsed[name] = parseField(field, min, max, expression);
  });
  return parsed;
}

function parseField(field: string, min: number, max: number, expression: string): number[] {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let value = min; value <= max; value += 1) values.add(value);
      continue;
    }
    const stepMatch = /^\*\/(\d+)$/.exec(part);
    if (stepMatch) {
      const step = parseStep(stepMatch[1], expression);
      for (let value = min; value <= max; value += step) values.add(value);
      continue;
    }
    const rangeStepMatch = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(part);
    if (rangeStepMatch) {
      const from = Number(rangeStepMatch[1]);
      const to = Number(rangeStepMatch[2]);
      const step = rangeStepMatch[3] ? parseStep(rangeStepMatch[3], expression) : 1;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to) {
        throw invalidCron(expression);
      }
      for (let value = from; value <= to; value += step) values.add(value);
      continue;
    }
    const single = /^(\d+)$/.exec(part);
    if (single) {
      const value = Number(single[1]);
      if (!Number.isInteger(value) || value < min || value > max) throw invalidCron(expression);
      values.add(value);
      continue;
    }
    throw invalidCron(expression);
  }
  return [...values].sort((a, b) => a - b);
}

function parseStep(raw: string, expression: string): number {
  const step = Number(raw);
  if (!Number.isInteger(step) || step < 1 || step > 60) throw invalidCron(expression);
  return step;
}

function invalidCron(expression: string): PlatformError {
  return new PlatformError('VALIDATION_ERROR', `Invalid cron expression: "${expression}".`);
}

/**
 * Parse a timezone token into a fixed offset in minutes east of UTC.
 * Accepts `UTC`, `Etc/UTC`, `GMT`, `Z`, and fixed offsets such as
 * `+01:00`, `-05:30`, or `+0`. DST zone names are rejected.
 */
export function parseTimezoneOffsetMinutes(timezone: string): number {
  const normalized = timezone.trim();
  if (normalized === '' || normalized === 'UTC' || normalized === 'Etc/UTC' || normalized === 'GMT' || normalized === 'Z') {
    return 0;
  }
  const match = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(normalized);
  if (!match) {
    throw new PlatformError(
      'VALIDATION_ERROR',
      `Unsupported timezone "${timezone}". Orcflo schedule triggers support UTC and fixed offsets (+HH:MM / -HH:MM) only.`,
    );
  }
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
  if (hours > 14 || minutes > 59) {
    throw new PlatformError('VALIDATION_ERROR', `Invalid timezone offset "${timezone}".`);
  }
  return sign * (hours * 60 + minutes);
}

function isFull(values: number[], min: number, max: number): boolean {
  return values.length === max - min + 1;
}

function dayMatches(parsed: ParsedCron, year: number, month: number, day: number): boolean {
  if (!parsed.month.includes(month + 1)) return false;
  const domFull = isFull(parsed.dom, 1, 31);
  const dowFull = isFull(parsed.dow, 0, 6);
  if (domFull && dowFull) return true;
  if (domFull) return parsed.dow.includes(toSundayZero(year, month, day));
  if (dowFull) return parsed.dom.includes(day);
  return parsed.dom.includes(day) || parsed.dow.includes(toSundayZero(year, month, day));
}

function toSundayZero(year: number, month: number, day: number): number {
  // Date.getUTCDay() uses 0 = Sunday already, but we receive parts;
  // construct the JS day-of-week from a UTC instant.
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

function shiftedMs(utcMs: number, offsetMinutes: number): number {
  return utcMs + offsetMinutes * 60_000;
}

/** True when the UTC instant `utcMs` matches the expression in `timezone`. */
export function cronMatchesAtMs(parsed: ParsedCron, utcMs: number, offsetMinutes: number): boolean {
  const shifted = new Date(shiftedMs(utcMs, offsetMinutes));
  if (!parsed.minute.includes(shifted.getUTCMinutes())) return false;
  if (!parsed.hour.includes(shifted.getUTCHours())) return false;
  return dayMatches(parsed, shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/** True when the ISO instant `atIso` matches the expression in `timezone`. */
export function cronMatches(expression: string, atIso: string, timezone = 'UTC'): boolean {
  const parsed = parseCronExpression(expression);
  return cronMatchesAtMs(parsed, Date.parse(atIso), parseTimezoneOffsetMinutes(timezone));
}

/**
 * Return the next `count` fire times (ISO strings, strictly after
 * `afterIso`) for the expression in `timezone`. The search is bounded
 * to 366 days so a never-firing expression returns fewer than `count`
 * results instead of looping forever.
 */
export function nextCronFires(expression: string, afterIso: string, count = 5, timezone = 'UTC'): string[] {
  const parsed = parseCronExpression(expression);
  const offsetMinutes = parseTimezoneOffsetMinutes(timezone);
  const afterMs = Date.parse(afterIso);
  const fires: string[] = [];
  const startShifted = new Date(shiftedMs(afterMs, offsetMinutes));
  const startYear = startShifted.getUTCFullYear();
  const startMonth = startShifted.getUTCMonth();
  const startDay = startShifted.getUTCDate();

  for (let dayOffset = 0; dayOffset <= 366 && fires.length < count; dayOffset += 1) {
    const day = new Date(Date.UTC(startYear, startMonth, startDay + dayOffset));
    if (!dayMatches(parsed, day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())) continue;
    for (const hour of parsed.hour) {
      for (const minute of parsed.minute) {
        const candidateMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute) - offsetMinutes * 60_000;
        if (candidateMs > afterMs) {
          fires.push(new Date(candidateMs).toISOString());
          if (fires.length >= count) break;
        }
      }
      if (fires.length >= count) break;
    }
  }
  return fires;
}

/**
 * Schedule-trigger due check for the current minute bucket.
 *
 * A trigger is due when:
 *  1. the expression matches the current minute in `timezone`, AND
 *  2. either it has never fired, or `lastFiredAtIso` is strictly older
 *     than the current minute bucket (so each bucket fires once even
 *     when a worker is slow or the drain endpoint is polled twice).
 */
export function isDueCron(expression: string, nowIso: string, lastFiredAtIso: string | undefined, timezone = 'UTC'): boolean {
  const parsed = parseCronExpression(expression);
  const offsetMinutes = parseTimezoneOffsetMinutes(timezone);
  const nowMs = Date.parse(nowIso);
  if (!cronMatchesAtMs(parsed, nowMs, offsetMinutes)) return false;
  if (lastFiredAtIso === undefined) return true;
  const shifted = new Date(shiftedMs(nowMs, offsetMinutes));
  const bucketStartMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), shifted.getUTCHours(), shifted.getUTCMinutes()) - offsetMinutes * 60_000;
  return Date.parse(lastFiredAtIso) < bucketStartMs;
}
