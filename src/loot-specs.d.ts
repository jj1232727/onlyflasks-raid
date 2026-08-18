export declare const DEFAULT_SPECS: Record<string, string>;
export declare const ROLES: string[];
export declare function defaultSpecFor(className: string, role: string, availableSpecs?: string[]): string;
export declare function invalidDefaults(availableSpecs?: string[]): string[];
export declare function matchSpec(availableSpecs: string[], className: string, shortName: string): string;
export declare function playedSpec(input: {
  availableSpecs?: string[];
  className: string;
  snapshotSpec?: string;
  simmedSpecs?: string[];
}): string;
export declare function simmedSpecsOf(entry: any): string[];
