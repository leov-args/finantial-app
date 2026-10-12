export const MAX_HOUSEHOLD_FILE_BYTES = 20 * 1024 * 1024;

export interface HouseholdArchiveSummary {
  readonly memberNames: readonly string[];
  readonly expenses: number;
  readonly incomes: number;
  readonly planItems: number;
  readonly dateRange: { readonly from: string; readonly to: string } | null;
}

declare const parsedHouseholdBrand: unique symbol;
/** Opaque validated archive payload; only the infrastructure adapter can create one. */
export interface ParsedHousehold {
  readonly [parsedHouseholdBrand]: true;
}

export interface HouseholdArchiveReadResult {
  readonly summary: HouseholdArchiveSummary;
  readonly parsed: ParsedHousehold;
}

export type HouseholdArchiveFailure = 'INVALID_FILE' | 'NEWER_DATABASE' | 'HOUSEHOLD_NOT_EMPTY' | 'HOUSEHOLD_UNRELATED';

export interface HouseholdMergeSummary {
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
  readonly hasChanges: boolean;
}

export class HouseholdArchiveError extends Error {
  constructor(readonly failure: HouseholdArchiveFailure) {
    super(failure);
    this.name = 'HouseholdArchiveError';
  }
}

export interface HouseholdArchive {
  read(text: string): HouseholdArchiveReadResult;
  export(createdAt: Date): Promise<string>;
  replaceAll(parsed: ParsedHousehold): Promise<void>;
  restore(parsed: ParsedHousehold): Promise<void>;
  planMerge(parsed: ParsedHousehold): Promise<HouseholdMergeSummary>;
  merge(parsed: ParsedHousehold): Promise<HouseholdMergeSummary>;
}
