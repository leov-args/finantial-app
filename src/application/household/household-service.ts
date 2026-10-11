import type { HouseholdArchiveReadResult, ParsedHousehold } from '../ports/household-archive.ts';
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

  async join(parsed: ParsedHousehold): Promise<void> {
    try {
      await this.ctx.tx.run(() => this.ctx.householdArchive.replaceAll(parsed));
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
    }
  }
}
