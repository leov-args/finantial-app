import type { Category } from '../../domain/category/category.ts';
import type { Expense } from '../../domain/expense/expense.ts';
import type { HouseholdSettings } from '../../domain/family/contributions.ts';
import type { PlanItem } from '../../domain/family/plan.ts';
import type { Income } from '../../domain/income/income.ts';
import type { Member } from '../../domain/member/member.ts';
import type { IsoDate } from '../../domain/shared/dates.ts';
import type { CategoryId, ExpenseId, IncomeId, MemberId, PlanItemId } from '../../domain/shared/ids.ts';

/**
 * Persistence ports. The application layer depends on these interfaces only;
 * Dexie implements them in src/infrastructure. A future mobile app or a
 * different storage engine implements the same ports.
 *
 * Repositories return fully validated domain objects, never raw records.
 * Date ranges are inclusive ("YYYY-MM-DD" .. "YYYY-MM-DD").
 */
export interface MemberRepository {
  getAll(): Promise<Member[]>;
  getById(id: MemberId): Promise<Member | undefined>;
  save(member: Member): Promise<void>;
  delete(id: MemberId): Promise<void>;
}

export interface CategoryRepository {
  getAll(): Promise<Category[]>;
  getById(id: CategoryId): Promise<Category | undefined>;
  save(category: Category): Promise<void>;
  delete(id: CategoryId): Promise<void>;
}

export interface IncomeRepository {
  getById(id: IncomeId): Promise<Income | undefined>;
  findByDateRange(from: IsoDate, to: IsoDate): Promise<Income[]>;
  countByMember(memberId: MemberId): Promise<number>;
  save(income: Income): Promise<void>;
  delete(id: IncomeId): Promise<void>;
}

export interface ExpenseRepository {
  getById(id: ExpenseId): Promise<Expense | undefined>;
  /** Sorted by date descending, then createdAt descending. */
  findByDateRange(from: IsoDate, to: IsoDate): Promise<Expense[]>;
  /** Most recent first. */
  findRecent(limit: number): Promise<Expense[]>;
  countByCategory(categoryId: CategoryId): Promise<number>;
  /** Expenses the member paid OR owns (individual scope). */
  countByMember(memberId: MemberId): Promise<number>;
  save(expense: Expense): Promise<void>;
  delete(id: ExpenseId): Promise<void>;
}

export interface PlanItemRepository {
  /** Oldest first. */
  getAll(): Promise<PlanItem[]>;
  getById(id: PlanItemId): Promise<PlanItem | undefined>;
  save(item: PlanItem): Promise<void>;
  delete(id: PlanItemId): Promise<void>;
}

export interface SettingsRepository {
  /** The stored settings, or the defaults when nothing was saved yet. */
  getHousehold(): Promise<HouseholdSettings>;
  saveHousehold(settings: HouseholdSettings): Promise<void>;
}

/**
 * Runs `work` atomically: either every write inside it is committed or none
 * is. Used whenever a use case checks a precondition and then writes, so the
 * check cannot be invalidated in between (e.g. deleting a category that an
 * expense is being attached to).
 */
export interface TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T>;
}
