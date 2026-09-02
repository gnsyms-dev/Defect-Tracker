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
