export declare function raidbotsReportId(value: unknown): string;
export declare const classIds: Record<string, number>;
export declare const specIds: Record<string, number>;
export declare function simcValue(text: string, key: string): string;
export declare function factionForSimc(text: string): string;
export declare const raidbotDifficulty: Record<
  "normal" | "heroic" | "mythic",
  { value: string; upgradeLevel: number; label: string; track: string }
>;
export declare function droptimizerPayload(
  text: string,
  c: { class: string },
  selectedSpec: string,
  difficulty?: "normal" | "heroic" | "mythic",
): Record<string, unknown>;
