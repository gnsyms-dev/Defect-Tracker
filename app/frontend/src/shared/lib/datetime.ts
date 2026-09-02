const IST = 'Asia/Kolkata';

/**
 * Today as `YYYY-MM-DD` in plant-local time.
 *
 * `en-CA` formats as YYYY-MM-DD directly, so there is no manual assembly. Using IST
 * rather than the device locale matters for the same reason it does on the server:
 * `new Date().toISOString().slice(0,10)` in a UTC-ish context would name yesterday
 * for the first 5.5 hours of every Indian day.
 */
export function todayInPlantTimeZone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Formats a `YYYY-MM-DD` string for display, without ever constructing a Date. */
export function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }
  const monthName = MONTHS[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthName} ${year}`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Relative for the last week, absolute after.
 *
 * A supervisor scanning today's defects wants "2 hours ago"; someone reviewing last
 * month wants a date. Switching at a week is where relative stops being useful.
 */
export function formatRelativeDate(value: string): string {
  const today = todayInPlantTimeZone();
  const days = daysBetween(value, today);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return `${days} days ago`;
  return formatCalendarDate(value);
}

/** Whole days between two `YYYY-MM-DD` strings. Parsed as UTC so there is no DST drift. */
export function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return 0;
  }
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** A clock time for an instant, in plant-local time. */
export function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

/** "just now" / "14:32" for the cache-freshness line. */
export function formatFetchedAt(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  if (ageMs < 60_000) {
    return 'just now';
  }
  return formatTime(new Date(timestamp).toISOString());
}

/** Human sync lag, e.g. "logged 3h before syncing". Empty when it synced immediately. */
export function formatSyncLag(seconds: number): string {
  if (seconds < 120) {
    return '';
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min offline`;
  }
  const hours = Math.round(seconds / 3600);
  return hours < 48 ? `${hours}h offline` : `${Math.round(hours / 24)}d offline`;
}

/** ISO instant with the device's real offset, for `loggedAt`. */
export function nowIsoWithOffset(): string {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hh = String(Math.floor(absolute / 60)).padStart(2, '0');
  const mm = String(absolute % 60).padStart(2, '0');

  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
}
