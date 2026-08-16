import { describe, expect, it } from 'vitest';
import { stableStringify } from '../lib/domain/stable-json';
import {
  cronMatches,
  isDueCron,
  nextCronFires,
  parseCronExpression,
  parseTimezoneOffsetMinutes,
} from '../lib/domain/cron';
import { PlatformError } from '../lib/domain/errors';

describe('stableStringify', () => {
  it('is independent of object key order', () => {
    const a = stableStringify({ b: 1, a: [2, { d: null, c: 'x' }] });
    const b = stableStringify({ a: [2, { c: 'x', d: null }], b: 1 });
    expect(a).toBe(b);
  });

  it('encodes primitives deterministically', () => {
    expect(stableStringify(undefined)).toBe('"__undefined__"');
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('a"b')).toBe(JSON.stringify('a"b'));
  });

  it('sorts keys recursively including nested objects', () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
  });
});

describe('cron parsing', () => {
  it('parses a valid 5-field expression', () => {
    const parsed = parseCronExpression('*/15 9-17 * * 1-5');
    expect(parsed.minute).toContain(0);
    expect(parsed.minute).toContain(15);
    expect(parsed.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(parsed.dom).toHaveLength(31);
    expect(parsed.dow).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects expressions without exactly five fields', () => {
    expect(() => parseCronExpression('* * * *')).toThrow(PlatformError);
    expect(() => parseCronExpression('* * * * * *')).toThrow(PlatformError);
  });

  it('rejects out-of-range and malformed fields', () => {
    expect(() => parseCronExpression('60 * * * *')).toThrow(PlatformError);
    expect(() => parseCronExpression('* 24 * * *')).toThrow(PlatformError);
    expect(() => parseCronExpression('* * 32 * *')).toThrow(PlatformError);
    expect(() => parseCronExpression('* * * 13 *')).toThrow(PlatformError);
    expect(() => parseCronExpression('* * * * 7')).toThrow(PlatformError);
    expect(() => parseCronExpression('a * * * *')).toThrow(PlatformError);
    expect(() => parseCronExpression('*/0 * * * *')).toThrow(PlatformError);
  });
});

describe('cron matching', () => {
  it('matches every minute for the wildcard expression', () => {
    expect(cronMatches('* * * * *', '2026-08-14T10:23:00Z')).toBe(true);
    expect(cronMatches('* * * * *', '2026-12-31T23:59:00Z')).toBe(true);
  });

  it('matches a step expression only on the step boundary', () => {
    expect(cronMatches('*/5 * * * *', '2026-08-14T10:05:00Z')).toBe(true);
    expect(cronMatches('*/5 * * * *', '2026-08-14T10:03:00Z')).toBe(false);
  });

  it('matches a fixed hour in UTC', () => {
    expect(cronMatches('0 9 * * *', '2026-08-14T09:00:00Z')).toBe(true);
    expect(cronMatches('0 9 * * *', '2026-08-14T09:01:00Z')).toBe(false);
  });

  it('applies a fixed timezone offset to the wall clock', () => {
    // 09:00 in +01:00 is 08:00 UTC.
    expect(cronMatches('0 9 * * *', '2026-08-14T08:00:00Z', '+01:00')).toBe(true);
    expect(cronMatches('0 9 * * *', '2026-08-14T09:00:00Z', '+01:00')).toBe(false);
  });

  it('uses vixie OR semantics when both dom and dow are restricted', () => {
    // 2026-11-13 is a Friday the 13th: dom=13 matches even though dow=6 (Saturday) does not.
    expect(cronMatches('0 0 13 * 6', '2026-11-13T00:00:00Z')).toBe(true);
    // 2026-11-14 is a Saturday (dow=6): dow matches even though dom=13 does not.
    expect(cronMatches('0 0 13 * 6', '2026-11-14T00:00:00Z')).toBe(true);
    // 2026-11-15 is a Sunday: neither matches.
    expect(cronMatches('0 0 13 * 6', '2026-11-15T00:00:00Z')).toBe(false);
  });

  it('rejects an unsupported timezone instead of silently miscomputing', () => {
    expect(() => cronMatches('0 0 * * *', '2026-08-14T00:00:00Z', 'Africa/Lagos')).toThrow(PlatformError);
    expect(parseTimezoneOffsetMinutes('-05:30')).toBe(-330);
    expect(parseTimezoneOffsetMinutes('Etc/UTC')).toBe(0);
  });
});

describe('nextCronFires', () => {
  it('returns the next five step boundaries', () => {
    const fires = nextCronFires('*/5 * * * *', '2026-08-14T10:00:00Z', 5);
    expect(fires).toEqual([
      '2026-08-14T10:05:00.000Z',
      '2026-08-14T10:10:00.000Z',
      '2026-08-14T10:15:00.000Z',
      '2026-08-14T10:20:00.000Z',
      '2026-08-14T10:25:00.000Z',
    ]);
  });

  it('walks across midnight and months', () => {
    const fires = nextCronFires('0 0 * * *', '2026-08-14T10:00:00Z', 3);
    expect(fires[0]).toBe('2026-08-15T00:00:00.000Z');
    expect(fires[1]).toBe('2026-08-16T00:00:00.000Z');
    expect(fires[2]).toBe('2026-08-17T00:00:00.000Z');
  });

  it('returns fewer results for an impossible expression instead of hanging', () => {
    const fires = nextCronFires('0 0 31 2 *', '2026-01-01T00:00:00Z', 5);
    expect(fires.length).toBeLessThan(5);
  });
});

describe('isDueCron', () => {
  const now = '2026-08-14T10:05:30Z';

  it('is due when the current bucket matches and it has never fired', () => {
    expect(isDueCron('*/5 * * * *', now, undefined)).toBe(true);
  });

  it('is not due when the expression does not match the current minute', () => {
    expect(isDueCron('*/5 * * * *', '2026-08-14T10:03:00Z', undefined)).toBe(false);
  });

  it('is due once per bucket even when polled twice', () => {
    // lastFiredAt is inside the 10:05 bucket -> not due again.
    expect(isDueCron('*/5 * * * *', now, '2026-08-14T10:05:10Z')).toBe(false);
    // lastFiredAt is strictly older than the 10:05 bucket -> due.
    expect(isDueCron('*/5 * * * *', now, '2026-08-14T10:04:59Z')).toBe(true);
  });
});
