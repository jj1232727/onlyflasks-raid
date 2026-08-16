export type SimcItem = {
  itemId: number;
  name: string;
  slot: string;
  itemLevel: number;
  bonusList: number[];
};
export type SimcSnapshot = {
  character: string;
  spec: string;
  lootSpec: string;
  capturedAt: string;
  bags: SimcItem[];
  vault: SimcItem[];
  catalystCurrencies: Record<string, number>;
  upgradeCurrencies: Record<string, number>;
  previousCatalystCurrencies?: Record<string, number>;
  previousCapturedAt?: string;
};

export declare function parseSimcSnapshot(text: string, capturedAt?: string): SimcSnapshot;
export declare const MIDNIGHT_S2_CRESTS: { champion: number; hero: number; myth: number };
export declare const CATALYST_CURRENCIES: Record<string, { name: string; icon: string }>;
export declare const MIDNIGHT_S2_CATALYST: number;
export declare function currentCatalystBalance(
  snapshot: { catalystCurrencies?: Record<string, number> } | null | undefined,
  currencies?: Record<string, number>,
): { id: number; quantity: number };
