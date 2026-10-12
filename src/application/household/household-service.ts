import { toLocalIsoDate } from '../../domain/shared/dates.ts';
import type { HouseholdArchiveReadResult, HouseholdMergeSummary, ParsedHousehold } from '../ports/household-archive.ts';
import { HouseholdArchiveError } from '../ports/household-archive.ts';
import type { AppContext } from '../shared/context.ts';
import { ApplicationError } from '../shared/errors.ts';

export class HouseholdService {
  constructor(private readonly ctx: AppContext) {}

  preview(text: string): HouseholdArchiveReadResult {
    try {
      return this.ctx.householdArchive.read(text);
    } catch (error) {
      throw this.toApplicationError(error);
    }
  }

  async exportFile(): Promise<{ filename: string; text: string }> {
    const createdAt = this.ctx.clock.now();
    const text = await this.ctx.householdArchive.export(createdAt);
    const date = toLocalIsoDate(createdAt);
    return { filename: `family-finance-${date}.json`, text };
  }

  async join(parsed: ParsedHousehold): Promise<void> {
    try {
      await this.ctx.tx.run(() => this.ctx.householdArchive.replaceAll(parsed));
    } catch (error) {
      throw this.toApplicationError(error);
    }
  }

  async restore(parsed: ParsedHousehold): Promise<void> {
    try {
      await this.ctx.tx.run(() => this.ctx.householdArchive.restore(parsed));
    } catch (error) {
      throw this.toApplicationError(error);
    }
  }

  async previewMerge(parsed: ParsedHousehold): Promise<HouseholdMergeSummary> {
    try {
      return await this.ctx.householdArchive.planMerge(parsed);
    } catch (error) {
      throw this.toApplicationError(error);
    }
  }

  async merge(parsed: ParsedHousehold): Promise<HouseholdMergeSummary> {
    try {
      return await this.ctx.householdArchive.merge(parsed);
    } catch (error) {
      throw this.toApplicationError(error);
    }
  }

  private toApplicationError(error: unknown): unknown {
    if (!(error instanceof HouseholdArchiveError)) return error;
    switch (error.failure) {
      case 'INVALID_FILE':
        return new ApplicationError('VALIDATION', 'Error.', [], { reason: 'HOUSEHOLD_INVALID_FILE' });
      case 'NEWER_DATABASE':
        return new ApplicationError('VALIDATION', 'Error.', [], { reason: 'HOUSEHOLD_NEWER_DATABASE' });
      case 'HOUSEHOLD_NOT_EMPTY':
        return new ApplicationError('CONFLICT', 'Error.', [], { reason: 'HOUSEHOLD_NOT_EMPTY' });
      case 'HOUSEHOLD_UNRELATED':
        return new ApplicationError('CONFLICT', 'Error.', [], { reason: 'HOUSEHOLD_UNRELATED' });
    }
  }
}
