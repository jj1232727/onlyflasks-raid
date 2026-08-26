// Hand-written types so App.tsx keeps full checking against the plain-JS module.
// Generic over the caller's equipment element type, so `equipped(raider, …)`
// still returns the app's own Item rather than widening to any.
export declare const norm: (s?: string) => string;
export declare const slot: (s?: string) => string;
export declare const PAIRED_SLOTS: Set<string>;
export declare const equippedGroup: <T>(
  c: { equipment: T[] },
  item: { slot?: string },
) => T[];
export declare const keptForOwnTargets: (
  c: { equipment: { itemId: number | string }[] },
  list: { itemId: number | string }[],
) => Set<number>;
export declare const equipped: <T>(
  c: { equipment: T[] },
  item: { itemId: number | string; slot?: string },
  kept?: Set<number>,
) => T | undefined;
export declare const assignReplacements: <T>(
  c: { equipment: T[] },
  list: { itemId: number | string; slot?: string }[],
) => Map<number, T | undefined>;
export declare const equippedItemLevel: (
  equipment: { slot?: string; itemLevel?: number | null }[],
) => number;
export declare const displayItemLevel: (
  equipment: { slot?: string; itemLevel?: number | null }[],
) => number;
export declare const filledSlotCount: (
  equipment: { slot?: string; itemLevel?: number | null }[],
) => number;
