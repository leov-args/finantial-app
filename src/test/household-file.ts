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
    planItems: [], settings: [], monthSnapshots: [], tombstones: [],
  }, new Date(timestamp));
}

export function makeRestorableHouseholdFile() {
  const timestamp = '2026-10-02T10:00:00.000Z';
  const member = {
    id: 'restored-member', name: 'Hogar restaurado', active: true, referenceIncome: null, color: 'blue',
    createdAt: timestamp, updatedAt: timestamp,
  };
  const category = {
    id: 'restored-category', name: 'Categoría restaurada', archived: false, createdAt: timestamp, updatedAt: timestamp,
  };
  return serializeHousehold({
    members: [member], categories: [category], incomes: [],
    expenses: [{
      id: 'restored-expense', description: 'Gasto restaurado', merchant: null, amountMinor: 1350, currency: 'EUR', date: '2026-10-02',
      categoryId: category.id, expenseType: 'VARIABLE', scopeType: 'INDIVIDUAL', ownerId: member.id, paidBy: member.id,
      recurrence: null, notes: '', receiptId: null, createdAt: timestamp, updatedAt: timestamp,
    }],
    planItems: [], settings: [], monthSnapshots: [], tombstones: [],
  }, new Date(timestamp));
}
