import { CategoryService } from '../application/categories/category-service.ts';
import { ExpenseService } from '../application/expenses/expense-service.ts';
import { PlanService } from '../application/family/plan-service.ts';
import { IncomeService } from '../application/income/income-service.ts';
import { MemberService } from '../application/members/member-service.ts';
import { PersonalService } from '../application/personal/personal-service.ts';
import { type IdGenerator, randomIdGenerator } from '../application/ports/system.ts';
import type { AppContext } from '../application/shared/context.ts';
import { type Clock, systemClock } from '../domain/shared/dates.ts';
import { DB_NAME, FamilyFinanceDb } from '../infrastructure/database/db.ts';
import {
  DexieCategoryRepository,
  DexieExpenseRepository,
  DexieIncomeRepository,
  DexieMemberRepository,
  DexiePlanItemRepository,
  DexieSettingsRepository,
  DexieTransactionRunner,
} from '../infrastructure/repositories/dexie-repositories.ts';

export interface AppServices {
  readonly members: MemberService;
  readonly categories: CategoryService;
  readonly incomes: IncomeService;
  readonly expenses: ExpenseService;
  readonly plan: PlanService;
  readonly personal: PersonalService;
  /** "Today" and the current month for the UI; fixed in tests. */
  readonly clock: Clock;
}

export interface App {
  readonly services: AppServices;
  /** Exposed for the composition root, backup (Phase 8) and tests only. */
  readonly db: FamilyFinanceDb;
  close(): void;
}

export interface AppOptions {
  readonly dbName?: string;
  readonly clock?: Clock;
  readonly newId?: IdGenerator;
}

/**
 * Composition root: the only place where concrete infrastructure is wired
 * to application services. The UI receives `AppServices` and never sees Dexie.
 */
export function createApp(options: AppOptions = {}): App {
  const clock = options.clock ?? systemClock;
  const db = new FamilyFinanceDb(options.dbName ?? DB_NAME, { now: () => clock.now() });

  const ctx: AppContext = {
    members: new DexieMemberRepository(db),
    categories: new DexieCategoryRepository(db),
    incomes: new DexieIncomeRepository(db),
    expenses: new DexieExpenseRepository(db),
    planItems: new DexiePlanItemRepository(db),
    settings: new DexieSettingsRepository(db),
    tx: new DexieTransactionRunner(db),
    clock,
    newId: options.newId ?? randomIdGenerator,
  };

  const plan = new PlanService(ctx);
  return {
    db,
    services: {
      members: new MemberService(ctx),
      categories: new CategoryService(ctx),
      incomes: new IncomeService(ctx),
      expenses: new ExpenseService(ctx),
      plan,
      personal: new PersonalService(ctx, plan),
      clock,
    },
    close: () => db.close(),
  };
}
