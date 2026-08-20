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
  upgradeItems: Record<string, number>;
  previousCatalystCurrencies?: Record<string, number>;
  previousCapturedAt?: string;
};

export declare function parseSimcSnapshot(text: string, capturedAt?: string): SimcSnapshot;
export declare const MIDNIGHT_S2_CRESTS: { champion: number; hero: number; myth: number };
export declare const CATALYST_CURRENCIES: Record<string, { name: string; icon: string }>;
export declare const MIDNIGHT_S2_CATALYST: number;
export declare function inspectSimcExport(text: string): {
  character: string;
  spec: string;
  addon: string;
  client: string;
  addonStale: boolean;
  hasCurrencies: boolean;
  bags: number;
  vault: number;
};
export declare function hasCurrencyData(
  snapshot: { upgradeCurrencies?: Record<string, number> } | null | undefined,
): boolean;
// `quantity` is null when the export did not report this currency at all -
// unknown, not zero.
export declare function currentCatalystBalance(
  snapshot: { catalystCurrencies?: Record<string, number> } | null | undefined,
  currencies?: Record<string, number>,
): { id: number; quantity: number | null };
export declare function catalystUnknownReason(
  snapshot: { capturedAt?: string; catalystCurrencies?: Record<string, number> } | null | undefined,
): string;
