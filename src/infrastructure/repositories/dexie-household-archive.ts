import type { HouseholdArchive, HouseholdArchiveReadResult, ParsedHousehold } from '../../application/ports/household-archive.ts';
import { HouseholdArchiveError } from '../../application/ports/household-archive.ts';
import { DEFAULT_CATEGORIES } from '../../domain/category/category.ts';
import type { FamilyFinanceDb } from '../database/db.ts';
import { parseHouseholdFile, serializeHousehold, type HouseholdFileData } from '../backup/household-file.ts';

export class DexieHouseholdArchive implements HouseholdArchive {
  constructor(private readonly db: FamilyFinanceDb) {}

  read(text: string): HouseholdArchiveReadResult {
    const { summary, parsed } = parseHouseholdFile(text);
    return { summary, parsed };
  }

  async export(createdAt: Date): Promise<string> {
    const data = await this.db.transaction('r', this.db.dataTables, async () => {
      const [members, categories, incomes, expenses, planItems, settings, monthSnapshots] = await Promise.all([
        this.db.members.toArray(), this.db.categories.toArray(), this.db.incomes.toArray(), this.db.expenses.toArray(),
        this.db.planItems.toArray(), this.db.settings.toArray(), this.db.monthSnapshots.toArray(),
      ]);
      return { members, categories, incomes, expenses, planItems, settings, monthSnapshots };
    });
    return serializeHousehold(data, createdAt);
  }

  async replaceAll(parsed: ParsedHousehold): Promise<void> {
    const data = parsed as unknown as HouseholdFileData;
    await this.db.transaction('rw', this.db.dataTables, async () => {
      const [members, incomes, expenses, planItems, settings, snapshots, categories] = await Promise.all([
        this.db.members.count(), this.db.incomes.count(), this.db.expenses.count(), this.db.planItems.count(),
        this.db.settings.count(), this.db.monthSnapshots.count(), this.db.categories.toArray(),
      ]);
      const seedCategories = categories.length === 0 || (categories.length === DEFAULT_CATEGORIES.length && categories.every((category) => {
        const seed = DEFAULT_CATEGORIES.find((item) => item.id === category.id);
        return seed !== undefined && seed.name === category.name && !category.archived;
      }));
      if (members + incomes + expenses + planItems + settings + snapshots > 0 || !seedCategories) {
        throw new HouseholdArchiveError('HOUSEHOLD_NOT_EMPTY');
      }

      for (const table of this.db.dataTables) await table.clear();
      await Promise.all([
        this.db.members.bulkAdd([...data.members]), this.db.categories.bulkAdd([...data.categories]),
        this.db.incomes.bulkAdd([...data.incomes]), this.db.expenses.bulkAdd([...data.expenses]),
        this.db.planItems.bulkAdd([...data.planItems]), this.db.settings.bulkAdd([...data.settings]),
        this.db.monthSnapshots.bulkAdd([...data.monthSnapshots]),
      ]);
    });
  }
}
