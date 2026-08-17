import { describe, expect, it } from 'vitest';
import { formatCostMinor, formatDate, formatDurationMs, statusTone, titleCase } from '../components/app-format';

describe('app-format helpers (Wave 1 surfaces)', () => {
  it('formats dates from ISO strings', () => {
    const out = formatDate('2026-08-14T10:05:00.000Z');
    expect(out).not.toBe('—');
    expect(out).toMatch(/Aug|08|2026/);
    expect(formatDate(undefined)).toBe('—');
  });

  it('formats durations in ms / s / m', () => {
    expect(formatDurationMs(undefined)).toBe('—');
    expect(formatDurationMs(250)).toBe('250ms');
    expect(formatDurationMs(1500)).toBe('1.5s');
    expect(formatDurationMs(90_000)).toBe('1m 30s');
  });

  it('formats minor-unit costs', () => {
    expect(formatCostMinor(undefined)).toBe('—');
    expect(formatCostMinor(2500)).toBe('NGN 25.00');
    expect(formatCostMinor(0, 'USD')).toBe('USD 0.00');
  });

  it('maps statuses to tones', () => {
    expect(statusTone('COMPLETED')).toBe('green');
    expect(statusTone('WAITING_APPROVAL')).toBe('orange');
    expect(statusTone('FAILED')).toBe('red');
    expect(statusTone('READY')).toBe('green');
    expect(statusTone('SOMETHING_ELSE')).toBe('gray');
  });

  it('title-cases snake identifiers', () => {
    expect(titleCase('human_approval')).toBe('Human Approval');
    expect(titleCase('AI_MODEL')).toBe('Ai Model');
  });
});
