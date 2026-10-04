import type { Clock } from '../../domain/shared/dates.ts';
import type {
  CategoryRepository,
  ExpenseRepository,
  IncomeRepository,
  MemberRepository,
  PlanItemRepository,
  SettingsRepository,
  TransactionRunner,
} from '../ports/repositories.ts';
import type { IdGenerator } from '../ports/system.ts';

/** Everything a use case may depend on. Built once in the composition root. */
export interface AppContext {
  readonly members: MemberRepository;
  readonly categories: CategoryRepository;
  readonly incomes: IncomeRepository;
  readonly expenses: ExpenseRepository;
  readonly planItems: PlanItemRepository;
  readonly settings: SettingsRepository;
  readonly tx: TransactionRunner;
  readonly clock: Clock;
  readonly newId: IdGenerator;
}
