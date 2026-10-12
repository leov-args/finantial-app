import type { Table } from 'dexie';
import type { HouseholdArchive, HouseholdArchiveReadResult, HouseholdMergeSummary, ParsedHousehold } from '../../application/ports/household-archive.ts';
import { HouseholdArchiveError } from '../../application/ports/household-archive.ts';
import { DEFAULT_CATEGORIES } from '../../domain/category/category.ts';
import type { FamilyFinanceDb } from '../database/db.ts';
import { parseHouseholdFile, serializeHousehold, validateHouseholdData, type HouseholdFileData } from '../backup/household-file.ts';
import { HouseholdMergeError, mergeHouseholds } from '../backup/household-merge.ts';

export class DexieHouseholdArchive implements HouseholdArchive {
  constructor(private readonly db: FamilyFinanceDb) {}

  read(text: string): HouseholdArchiveReadResult {
    const { summary, parsed } = parseHouseholdFile(text);
    return { summary, parsed };
  }

  async export(createdAt: Date): Promise<string> {
    const data = await this.db.transaction('r', this.db.dataTables, async () => {
      const [members, categories, incomes, expenses, planItems, settings, monthSnapshots, tombstones] = await Promise.all([
        this.db.members.toArray(), this.db.categories.toArray(), this.db.incomes.toArray(), this.db.expenses.toArray(),
        this.db.planItems.toArray(), this.db.settings.toArray(), this.db.monthSnapshots.toArray(), this.db.tombstones.toArray(),
      ]);
      return { members, categories, incomes, expenses, planItems, settings, monthSnapshots, tombstones };
    });
    return serializeHousehold(data, createdAt);
  }

  async replaceAll(parsed: ParsedHousehold): Promise<void> {
    await this.clearAndWrite(parsed, true);
  }

  async restore(parsed: ParsedHousehold): Promise<void> {
    await this.clearAndWrite(parsed, false);
  }

  async planMerge(parsed: ParsedHousehold): Promise<HouseholdMergeSummary> {
    const incoming = parsed as unknown as HouseholdFileData;
    const local = await this.db.transaction('r', this.db.dataTables, () => this.readData());
    return this.createMergePlan(local, incoming).plan.summary;
  }

  async merge(parsed: ParsedHousehold): Promise<HouseholdMergeSummary> {
    const incoming = parsed as unknown as HouseholdFileData;
    return this.db.transaction('rw', this.db.dataTables, async () => {
      const local = await this.readData();
      const { plan } = this.createMergePlan(local, incoming);
      await this.applyPlan(plan);
      return plan.summary;
    });
  }

  private async readData(): Promise<HouseholdFileData> {
    const [members, categories, incomes, expenses, planItems, settings, monthSnapshots, tombstones] = await Promise.all([
      this.db.members.toArray(), this.db.categories.toArray(), this.db.incomes.toArray(), this.db.expenses.toArray(),
      this.db.planItems.toArray(), this.db.settings.toArray(), this.db.monthSnapshots.toArray(), this.db.tombstones.toArray(),
    ]);
    return { members, categories, incomes, expenses, planItems, settings, monthSnapshots, tombstones };
  }

  private createMergePlan(local: HouseholdFileData, incoming: HouseholdFileData) {
    try {
      validateHouseholdData(local);
      validateHouseholdData(incoming);
      const merged = mergeHouseholds(local, incoming);
      validateHouseholdData(merged.result);
      return merged;
    } catch (error) {
      if (error instanceof HouseholdMergeError) throw new HouseholdArchiveError(error.failure);
      if (error instanceof HouseholdArchiveError) throw error;
      throw new HouseholdArchiveError('INVALID_FILE');
    }
  }

  private async applyPlan(plan: ReturnType<typeof mergeHouseholds>['plan']): Promise<void> {
    await this.applyTable(this.db.members, plan.members);
    await this.applyTable(this.db.categories, plan.categories);
    await this.applyTable(this.db.incomes, plan.incomes);
    await this.applyTable(this.db.expenses, plan.expenses);
    await this.applyTable(this.db.planItems, plan.planItems);
    await this.applyTable(this.db.settings, plan.settings);
    await this.applyTable(this.db.monthSnapshots, plan.monthSnapshots);
    if (plan.tombstones.clear.length > 0) {
      await this.db.tombstones.bulkDelete(plan.tombstones.clear.map(({ table, id }) => [table, id]));
    }
    if (plan.tombstones.puts.length > 0) await this.db.tombstones.bulkPut([...plan.tombstones.puts]);
  }

  private async applyTable<T>(table: Table<T, string>, changes: { readonly puts: readonly T[]; readonly deletes: readonly string[] }): Promise<void> {
    if (changes.deletes.length > 0) await table.bulkDelete([...changes.deletes]);
    if (changes.puts.length > 0) await table.bulkPut([...changes.puts]);
  }

  private async clearAndWrite(parsed: ParsedHousehold, requireEmpty: boolean): Promise<void> {
    const data = parsed as unknown as HouseholdFileData;
    await this.db.transaction('rw', this.db.dataTables, async () => {
      if (requireEmpty) {
        const [members, incomes, expenses, planItems, settings, snapshots, tombstones, categories] = await Promise.all([
          this.db.members.count(), this.db.incomes.count(), this.db.expenses.count(), this.db.planItems.count(),
          this.db.settings.count(), this.db.monthSnapshots.count(), this.db.tombstones.count(), this.db.categories.toArray(),
        ]);
        const seedCategories = categories.length === 0 || (categories.length === DEFAULT_CATEGORIES.length && categories.every((category) => {
          const seed = DEFAULT_CATEGORIES.find((item) => item.id === category.id);
          return seed !== undefined && seed.name === category.name && !category.archived;
        }));
        if (members + incomes + expenses + planItems + settings + snapshots + tombstones > 0 || !seedCategories) {
          throw new HouseholdArchiveError('HOUSEHOLD_NOT_EMPTY');
        }
      }

      for (const table of this.db.dataTables) await table.clear();
      await Promise.all([
        this.db.members.bulkAdd([...data.members]), this.db.categories.bulkAdd([...data.categories]),
        this.db.incomes.bulkAdd([...data.incomes]), this.db.expenses.bulkAdd([...data.expenses]),
        this.db.planItems.bulkAdd([...data.planItems]), this.db.settings.bulkAdd([...data.settings]),
        this.db.monthSnapshots.bulkAdd([...data.monthSnapshots]), this.db.tombstones.bulkAdd([...data.tombstones]),
      ]);
    });
  }
}
