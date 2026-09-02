/**
 * Both plant regions (Gujarat and Maharashtra) are IST. The container and database
 * run UTC, so "is this date in the future?" has to be asked in plant-local terms --
 * otherwise a supervisor logging at 09:00 IST on the 1st looks like they are
 * backdating to the 31st for the first 5.5 hours of every day.
 *
 * A module constant rather than an env var: it is not per-deployment configuration,
 * and every env var costs a validator entry plus two files of documentation.
 */
export const PLANT_TIME_ZONE = 'Asia/Kolkata';

/**
 * `logged_at` comes from an untrusted device clock. A phone running fast must not
 * be able to create records dated in the future, but small skew is normal and
 * should not be an error the supervisor has to understand.
 */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Beyond this, the device clock is broken rather than the entry being a backlog. */
export const MAX_LOGGED_AT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const MIN_RESOLUTION_NOTE_LENGTH = 5;
export const MAX_RESOLUTION_NOTE_LENGTH = 1000;
export const MAX_REMARKS_LENGTH = 1000;
export const MAX_MACHINE_LINE_ID_LENGTH = 50;

/**
 * Machines and lines are stencilled on the floor as a five-letter section code, a
 * hyphen, then a zero-padded three-digit unit number -- LOOMA-004, WEAVE-112. That
 * exact shape is the only thing accepted for a NEW inspection.
 *
 * The point is not tidiness: `machine_line_id` is a free-text column that every
 * report groups by, and "loom 4" / "Loom-04" / "LOOMA-4" silently become three
 * different machines. No downstream grouping can undo that, so it is rejected at
 * the edge instead. Input is trimmed and upper-cased first, which means a casing
 * slip is normalised rather than turned into an error the supervisor has to fix.
 *
 * Because the pattern fixes the length at exactly 9 characters, it also subsumes
 * MAX_MACHINE_LINE_ID_LENGTH on the create path -- that constant now only bounds the
 * list FILTER, which is a substring search and deliberately NOT held to this format
 * (a partial value like "LOOM" is the entire point of a search box).
 */
export const MACHINE_LINE_ID_PATTERN = /^[A-Z]{5}-\d{3}$/;

/** Carries the expected shape, because a bare "invalid format" is not actionable. */
export const MACHINE_LINE_ID_FORMAT_MESSAGE =
  'machineLineId must be exactly 5 letters, a hyphen, then 3 digits (e.g. LOOMA-004)';
