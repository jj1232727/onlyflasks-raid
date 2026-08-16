export declare const TIER_SLOTS: string[];
export declare const TIER_SLOT_KEY: Record<string, string>;
export declare const trackOrder: (item?: { bonusList?: number[] } | null) => number;
export declare const trackName: (item?: { bonusList?: number[] } | null) => string;
export declare const trackLetter: (item?: { bonusList?: number[] } | null) => string;
export declare const trackRank: (item?: { bonusList?: number[] } | null) => number;
export declare const bonusForPieces: (pieces: number) => number;
export declare function tierIdsForClass(
  tierItemsBySlot: any,
  classId: number | string,
): Record<string, number>;
export declare function tierSetStatus<T = any>(input: {
  equipment?: T[];
  bags?: T[];
  tierIds?: Record<string, number>;
  charges?: number | null;
}): {
  slots: {
    slot: string;
    tierId: number;
    worn?: T;
    base?: T;
    source?: T;
    sourceInBags: boolean;
    sourceTrack: string;
    sourceTrackOrder: number;
    track: string;
    trackOrder: number;
    state: "tier" | "stored" | "ready" | "waiting" | "missing";
    evidence?: T;
  }[];
  pieces: number;
  stored: number;
  bagTier: T[];
  bagBases: T[];
  convertibleSlots: number;
  ready: number;
  waiting: number;
  missing: number;
  trackMix: Record<string, number>;
  setBonus: number;
  reachable: number;
  reachableBonus: number;
  freePieces: number;
  catalysable: number;
  hiddenUpgrade: boolean;
  verdict: "done" | "self" | "charge" | "drop";
};
export declare function tierDifficultyValue(
  statuses: any[],
  targetTrackOrder: number,
): {
  needFor4: number;
  selfSolve: number;
  newPieces: number;
  trackUpgrades: number;
  upgradeSlots: number;
  verdict: "worth" | "ilvl" | "skip";
};
export declare function tierRosterSummary(
  rows: { verdict: string; charges?: number | null }[],
): { done: number; self: number; charge: number; drop: number; charges: number };
