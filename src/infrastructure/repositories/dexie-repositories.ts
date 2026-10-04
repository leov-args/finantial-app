import type {
  CategoryRepository,
  ExpenseRepository,
  IncomeRepository,
  MemberRepository,
  PlanItemRepository,
  SettingsRepository,
  TransactionRunner,
} from '../../application/ports/repositories.ts';
import type { Category } from '../../domain/category/category.ts';
import type { Expense } from '../../domain/expense/expense.ts';
import { DEFAULT_SPLIT_RULE, type HouseholdSettings } from '../../domain/family/contributions.ts';
import type { PlanItem } from '../../domain/family/plan.ts';
import type { Income } from '../../domain/income/income.ts';
import type { Member } from '../../domain/member/member.ts';
import type { IsoDate } from '../../domain/shared/dates.ts';
import type { CategoryId, ExpenseId, IncomeId, MemberId, PlanItemId } from '../../domain/shared/ids.ts';
import type { FamilyFinanceDb } from '../database/db.ts';
import {
  categoryFromRecord,
  categoryToRecord,
  expenseFromRecord,
  expenseToRecord,
  incomeFromRecord,
  incomeToRecord,
  memberFromRecord,
  memberToRecord,
  planItemFromRecord,
  planItemToRecord,
  settingsFromRecord,
  settingsToRecord,
} from '../database/mappers.ts';
import type { ExpenseRecord } from '../database/records.ts';

const byNewest = (a: ExpenseRecord, b: ExpenseRecord): number =>
  a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date);

export class DexieMemberRepository implements MemberRepository {
  constructor(private readonly db: FamilyFinanceDb) {}

  async getAll(): Promise<Member[]> {
    const rows = await this.db.members.toArray();
    return rows.map(memberFromRecord).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getById(id: MemberId): Promise<Member | undefined> {
    const row = await this.db.members.get(id);
    return row && memberFromRecord(row);
  }

  async save(member: Member): Promise<void> {
    await this.db.members.put(memberToRecord(member));
  }

  async delete(id: MemberId): Promise<void> {
    await this.db.members.delete(id);
  }
}

export class DexieCategoryRepository implements CategoryRepository {
  constructor(private readonly db: FamilyFinanceDb) {}

  async getAll(): Promise<Category[]> {
    return (await this.db.categories.toArray()).map(categoryFromRecord);
  }

  async getById(id: CategoryId): Promise<Category | undefined> {
    const row = await this.db.categories.get(id);
    return row && categoryFromRecord(row);
  }

  async save(category: Category): Promise<void> {
    await this.db.categories.put(categoryToRecord(category));
  }

  async delete(id: CategoryId): Promise<void> {
    await this.db.categories.delete(id);
  }
}

export class DexieIncomeRepository implements IncomeRepository {
  constructor(private readonly db: FamilyFinanceDb) {}

  async getById(id: IncomeId): Promise<Income | undefined> {
    const row = await this.db.incomes.get(id);
    return row && incomeFromRecord(row);
  }

  async findByDateRange(from: IsoDate, to: IsoDate): Promise<Income[]> {
    const rows = await this.db.incomes.where('date').between(from, to, true, true).toArray();
    return rows.map(incomeFromRecord);
  }

  countByMember(memberId: MemberId): Promise<number> {
    return this.db.incomes.where('memberId').equals(memberId).count();
  }

  async save(income: Income): Promise<void> {
    await this.db.incomes.put(incomeToRecord(income));
  }

  async delete(id: IncomeId): Promise<void> {
    await this.db.incomes.delete(id);
  }
}

export class DexieExpenseRepository implements ExpenseRepository {
  constructor(private readonly db: FamilyFinanceDb) {}

  async getById(id: ExpenseId): Promise<Expense | undefined> {
    const row = await this.db.expenses.get(id);
    return row && expenseFromRecord(row);
  }

  async findByDateRange(from: IsoDate, to: IsoDate): Promise<Expense[]> {
    const rows = await this.db.expenses.where('date').between(from, to, true, true).toArray();
    return rows.sort(byNewest).map(expenseFromRecord);
  }

  async findRecent(limit: number): Promise<Expense[]> {
    if (limit <= 0) return [];
    // Walk the `date` index backwards; then widen to every row on the cutoff
    // day so same-day ties are ordered by createdAt correctly.
    const newest = await this.db.expenses.orderBy('date').reverse().limit(limit).toArray();
    const cutoff = newest[newest.length - 1]?.date;
    const rows =
      newest.length < limit || cutoff === undefined
        ? newest
        : await this.db.expenses.where('date').aboveOrEqual(cutoff).toArray();
    return rows.sort(byNewest).slice(0, limit).map(expenseFromRecord);
  }

  countByCategory(categoryId: CategoryId): Promise<number> {
    return this.db.expenses.where('categoryId').equals(categoryId).count();
  }

  async countByMember(memberId: MemberId): Promise<number> {
    const ids = new Set<string>();
    for (const key of await this.db.expenses.where('paidBy').equals(memberId).primaryKeys()) ids.add(key);
    for (const key of await this.db.expenses.where('ownerId').equals(memberId).primaryKeys()) ids.add(key);
    return ids.size;
  }

  async save(expense: Expense): Promise<void> {
    await this.db.expenses.put(expenseToRecord(expense));
  }

  async delete(id: ExpenseId): Promise<void> {
    await this.db.expenses.delete(id);
  }
}

export class DexiePlanItemRepository implements PlanItemRepository {
  constructor(private readonly db: FamilyFinanceDb) {}

  async getAll(): Promise<PlanItem[]> {
    const rows = await this.db.planItems.toArray();
    return rows.map(planItemFromRecord).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async getById(id: PlanItemId): Promise<PlanItem | undefined> {
    const row = await this.db.planItems.get(id);
    return row && planItemFromRecord(row);
  }

  async save(item: PlanItem): Promise<void> {
    await this.db.planItems.put(planItemToRecord(item));
  }

  async delete(id: PlanItemId): Promise<void> {
    await this.db.planItems.delete(id);
  }
}

export class DexieSettingsRepository implements SettingsRepository {
  constructor(private readonly db: FamilyFinanceDb) {}

  async getHousehold(): Promise<HouseholdSettings> {
    const row = await this.db.settings.get('household');
    return row ? settingsFromRecord(row) : Object.freeze({ splitRule: DEFAULT_SPLIT_RULE });
  }

  async saveHousehold(settings: HouseholdSettings): Promise<void> {
    await this.db.settings.put(settingsToRecord(settings));
  }
}

/** All use-case transactions span every data table: simple and always correct at this scale. */
export class DexieTransactionRunner implements TransactionRunner {
  constructor(private readonly db: FamilyFinanceDb) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.db.transaction('rw', this.db.dataTables, work);
  }
}
