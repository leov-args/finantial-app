import { serializeHousehold } from '../infrastructure/backup/household-file.ts';

export function makeHouseholdFile(names: readonly string[]) {
  const timestamp = '2026-10-02T10:00:00.000Z';
  return serializeHousehold({
    members: names.map((name, index) => ({
      id: `member-${index + 1}`, name, active: true, referenceIncome: null, color: index === 0 ? 'blue' : 'indigo',
      createdAt: timestamp, updatedAt: timestamp,
    })),
    categories: [{ id: 'category-food', name: 'Comida', archived: false, createdAt: timestamp, updatedAt: timestamp }],
    incomes: [],
    expenses: names.length > 0 ? [{
      id: 'expense-1', description: 'Compra', merchant: null, amountMinor: 3500, currency: 'EUR', date: '2026-09-14',
      categoryId: 'category-food', expenseType: 'VARIABLE', scopeType: 'SHARED', ownerId: null, paidBy: 'member-1',
      recurrence: null, notes: '', receiptId: null, createdAt: timestamp, updatedAt: timestamp,
    }] : [],
    planItems: [], settings: [], monthSnapshots: [],
  }, new Date(timestamp));
}
