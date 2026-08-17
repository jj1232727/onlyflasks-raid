export type QeReportSummary = {
  id: string;
  character: string;
  realm: string;
  region: string;
  spec: string;
  contentType: string;
  capturedAt: string;
  // difficulty -> { itemId: percentGain }
  difficulties: Record<string, Record<string, number>>;
};
export declare const QE_REPORT_API: string;
export declare const QE_RAID_DIFFICULTY: Record<number, string>;
export declare function qeReportId(value: string): string;
export declare function qeReportUrl(value: string): string;
export declare function parseQeReport(payload: unknown): any;
export declare function qeRaidScores(report: unknown, difficulty?: string): Map<number, number>;
export declare function qeReportSummary(payload: unknown): QeReportSummary;
