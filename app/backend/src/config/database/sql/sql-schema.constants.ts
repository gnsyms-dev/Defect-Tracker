export const SqlSchema = {
  Hakka: 'hakka',
  MlForecasts: 'ml_forecasts',
} as const;

export type SqlSchema = (typeof SqlSchema)[keyof typeof SqlSchema];
