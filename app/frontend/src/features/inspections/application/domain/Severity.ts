export const Severity = {
  Critical: 'critical',
  Major: 'major',
  Minor: 'minor',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

/** Worst first, matching the order the API returns in its summary. */
export const SEVERITY_ORDER: readonly Severity[] = [
  Severity.Critical,
  Severity.Major,
  Severity.Minor,
];

export const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  [Severity.Critical]: 'Critical',
  [Severity.Major]: 'Major',
  [Severity.Minor]: 'Minor',
};

/**
 * Token-driven classes, never raw hex in JSX.
 *
 * Red / amber / slate-blue, deliberately NOT red/amber/green: green must mean
 * "Resolved" and nothing else, so severity may never borrow it. The tokens also carry
 * lightened variants for dark mode, which is why this indirection exists at all.
 */
export const SEVERITY_BADGE_CLASSES: Readonly<Record<Severity, string>> = {
  [Severity.Critical]: 'bg-critical-bg text-critical',
  [Severity.Major]: 'bg-major-bg text-major',
  [Severity.Minor]: 'bg-minor-bg text-minor',
};

export const SEVERITY_ACCENT_CLASSES: Readonly<Record<Severity, string>> = {
  [Severity.Critical]: 'bg-critical',
  [Severity.Major]: 'bg-major',
  [Severity.Minor]: 'bg-minor',
};

export const SEVERITY_SELECTED_CLASSES: Readonly<Record<Severity, string>> = {
  [Severity.Critical]: 'border-critical bg-critical text-white',
  [Severity.Major]: 'border-major bg-major text-white',
  [Severity.Minor]: 'border-minor bg-minor text-white',
};
