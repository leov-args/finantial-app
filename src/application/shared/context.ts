import type { Clock } from '../../domain/shared/dates.ts';
import type {
  CategoryRepository,
  ExpenseRepository,
  IncomeRepository,
  MemberRepository,
  MonthSnapshotRepository,
  PlanItemRepository,
  SettingsRepository,
  TransactionRunner,
} from '../ports/repositories.ts';
import type { IdGenerator } from '../ports/system.ts';
import type { HouseholdArchive } from '../ports/household-archive.ts';

/** Everything a use case may depend on. Built once in the composition root. */
export interface AppContext {
  readonly members: MemberRepository;
  readonly categories: CategoryRepository;
  readonly incomes: IncomeRepository;
  readonly expenses: ExpenseRepository;
  readonly planItems: PlanItemRepository;
  readonly settings: SettingsRepository;
  readonly snapshots: MonthSnapshotRepository;
  readonly householdArchive: HouseholdArchive;
  readonly tx: TransactionRunner;
  readonly clock: Clock;
  readonly newId: IdGenerator;
}
