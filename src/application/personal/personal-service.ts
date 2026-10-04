import { type CurrencyCode, DEFAULT_CURRENCY } from '../../domain/money/currency.ts';
import { HISTORY_MONTHS, type PersonalMonth, personalMonth } from '../../domain/personal/personal-month.ts';
import { type YearMonth, addMonths, monthRange } from '../../domain/shared/dates.ts';
import type { MemberId } from '../../domain/shared/ids.ts';
import type { PlanService } from '../family/plan-service.ts';
import type { AppContext } from '../shared/context.ts';
import { notFound } from '../shared/errors.ts';

/** Personal view (P1–P4): figures the UI and the assistant only display, never recompute. */
export class PersonalService {
  constructor(
    private readonly ctx: AppContext,
    private readonly plan: PlanService,
  ) {}

  async monthSummary(memberId: MemberId, month: YearMonth, currency: CurrencyCode = DEFAULT_CURRENCY): Promise<PersonalMonth> {
    const { from, to } = monthRange(month);
    const historyFrom = monthRange(addMonths(month, -(HISTORY_MONTHS - 1))).from;
    const [member, incomes, expenses, split] = await Promise.all([
      this.ctx.members.getById(memberId),
      this.ctx.incomes.findByDateRange(from, to),
      this.ctx.expenses.findByDateRange(historyFrom, to),
      this.plan.contributions(currency),
    ]);
    if (!member) throw notFound('Member', memberId);
    return personalMonth({
      memberId,
      month,
      referenceIncome: member.referenceIncome,
      contribution: split.contributions.find((c) => c.memberId === memberId)?.total ?? null,
      incomes,
      expenses,
      currency,
    });
  }
}
