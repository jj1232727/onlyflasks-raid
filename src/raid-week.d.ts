export declare const RESET_UTC_DAY: number;
export declare const RESET_UTC_HOUR: number;
export declare function lastWeeklyReset(now?: Date): Date;
export declare function nextWeeklyReset(now?: Date): Date;
export declare function isBeforeReset(iso?: string | null, now?: Date): boolean;
export declare function simTimestamps(sims: any, characterId?: number | string): string[];
export declare function simStatus(
  sims: any,
  now?: Date,
): { current: number; expired: number; never: number; newest: string | null };
