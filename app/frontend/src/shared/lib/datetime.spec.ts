import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  formatCalendarDate,
  formatSyncLag,
  nowIsoWithOffset,
} from './datetime';

describe('formatCalendarDate', () => {
  it('formats a calendar date without constructing a Date', () => {
    // Constructing a Date is exactly what would reintroduce the timezone shift the
    // DATE column exists to avoid, so this must be pure string work.
    expect(formatCalendarDate('2026-09-01')).toBe('1 Sep 2026');
    expect(formatCalendarDate('2026-01-31')).toBe('31 Jan 2026');
  });

  it('returns the input unchanged when it is not a calendar date', () => {
    expect(formatCalendarDate('nonsense')).toBe('nonsense');
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-07-01', '2026-09-01')).toBe(62);
  });

  it('is unaffected by month and year boundaries', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('formatSyncLag', () => {
  it('says nothing when the entry synced effectively immediately', () => {
    expect(formatSyncLag(0)).toBe('');
    expect(formatSyncLag(45)).toBe('');
  });

  it('reports minutes, hours and days', () => {
    expect(formatSyncLag(600)).toBe('10 min offline');
    expect(formatSyncLag(7200)).toBe('2h offline');
    expect(formatSyncLag(3600 * 72)).toBe('3d offline');
  });
});

describe('nowIsoWithOffset', () => {
  it('emits an ISO instant carrying an explicit offset', () => {
    // The offset is what makes `loggedAt` unambiguous on the server, which matters
    // because the value comes from an untrusted device clock.
    expect(nowIsoWithOffset()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
  });

  it('round-trips to approximately now', () => {
    const parsed = Date.parse(nowIsoWithOffset());
        expect(Math.abs(parsed - Date.now())).toBeLessThan(5000);
  });
});
