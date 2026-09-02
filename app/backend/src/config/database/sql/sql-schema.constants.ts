export const SqlSchema = {
  App: 'app',
} as const;

export type SqlSchema = (typeof SqlSchema)[keyof typeof SqlSchema];
