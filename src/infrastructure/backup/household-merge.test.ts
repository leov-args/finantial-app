import { describe, expect, it } from 'vitest';
import { asTimestamp } from '../../domain/shared/dates.ts';
import type { HouseholdFileData } from './household-file.ts';
import { mergeHouseholds } from './household-merge.ts';

const old = '2026-10-01T10:00:00.000Z';
const newer = '2026-10-02T10:00:00.000Z';
const newest = '2026-10-03T10:00:00.000Z';

function household(overrides: Partial<HouseholdFileData> = {}): HouseholdFileData {
  return {
    members: [member('member-a', 'Ana', old)],
    categories: [category('category-a', 'Comida', old)],
    incomes: [], expenses: [], planItems: [], settings: [], monthSnapshots: [], tombstones: [],
    ...overrides,
  };
}

function member(id: string, name: string, updatedAt: string) {
  return { id, name, active: true, referenceIncome: null, color: 'blue', createdAt: old, updatedAt };
}

function category(id: string, name: string, updatedAt: string) {
  return { id, name, archived: false, createdAt: old, updatedAt };
}

function expense(id: string, updatedAt: string, paidBy = 'member-a', categoryId = 'category-a') {
  return {
    id, description: id, merchant: null, amountMinor: 100, currency: 'EUR', date: '2026-10-01', categoryId,
    expenseType: 'VARIABLE', scopeType: 'SHARED' as const, ownerId: null, paidBy, recurrence: null,
    notes: '', receiptId: null, createdAt: old, updatedAt,
  };
}

function income(id: string, memberId: string, updatedAt: string) {
  return {
    id, memberId, amountMinor: 1000, currency: 'EUR', date: '2026-10-01', scheduleKind: 'MONTHLY' as const,
    variability: 'FIXED' as const, source: 'SALARY', description: id, notes: '', createdAt: old, updatedAt,
  };
}

function planItem(id: string, name: string, updatedAt: string, memberId?: string) {
  return memberId === undefined
    ? { id, name, kind: 'FORMULA' as const, currency: 'EUR', amountMinor: 1000, shares: [], createdAt: old, updatedAt }
    : { id, name, kind: 'ASSIGNED' as const, currency: 'EUR', amountMinor: null, shares: [{ memberId, amountMinor: 1000 }], createdAt: old, updatedAt };
}

function tombstone(table: 'members' | 'categories' | 'incomes' | 'expenses' | 'planItems', id: string, deletedAt: string) {
  return { table, id, deletedAt: asTimestamp(deletedAt) } as const;
}

describe('mergeHouseholds', () => {
  it('chooses the newest live record and breaks equal-time ties canonically in either direction', () => {
    const local = household({ members: [member('member-a', 'Zoe', newer)] });
    const incoming = household({ members: [member('member-a', 'Ana', newer)] });

    const forward = mergeHouseholds(local, incoming).result;
    const reverse = mergeHouseholds(incoming, local).result;

    expect(forward.members).toEqual(reverse.members);
    expect(forward.members[0]?.name).toBe('Zoe');
    expect(mergeHouseholds(household({ members: [member('member-a', 'Local', newest)] }), incoming).result.members[0]?.name).toBe('Local');
  });

  it('applies winning tombstones, preserves newer edits, and does not resurrect older live rows', () => {
    const local = household({
      members: [member('member-a', 'Ana', old)],
      categories: [category('category-a', 'Comida', newest)],
      tombstones: [tombstone('expenses', 'deleted-expense', newer)],
    });
    const incoming = household({
      members: [],
      categories: [category('category-a', 'Alimentación', old)],
      expenses: [expense('deleted-expense', old)],
      tombstones: [tombstone('members', 'member-a', newer)],
    });

    const result = mergeHouseholds(local, incoming).result;

    expect(result.members).toEqual([]);
    expect(result.categories[0]?.name).toBe('Comida');
    expect(result.expenses).toEqual([]);
    expect(result.tombstones).toEqual([
      tombstone('members', 'member-a', newer), tombstone('expenses', 'deleted-expense', newer),
    ]);
  });

  it('keeps a newer local live record over an older incoming tombstone, but lets a tied tombstone win', () => {
    const local = household({ members: [member('member-a', 'Ana editada', newer)] });
    const olderDeletion = household({ members: [], tombstones: [tombstone('members', 'member-a', old)] });
    const tiedDeletion = household({ members: [], tombstones: [tombstone('members', 'member-a', newer)] });

    expect(mergeHouseholds(local, olderDeletion).result.members).toEqual(local.members);
    expect(mergeHouseholds(local, olderDeletion).result.tombstones).toEqual([]);
    expect(mergeHouseholds(local, tiedDeletion).result.members).toEqual([]);
  });

  it('propagates tombstones without a live row and keeps the newest of two tombstones', () => {
    const local = household({ tombstones: [tombstone('planItems', 'deleted-plan', old)] });
    const incoming = household({ tombstones: [tombstone('planItems', 'deleted-plan', newer)] });

    const merged = mergeHouseholds(local, incoming);

    expect(merged.result.planItems).toEqual([]);
    expect(merged.result.tombstones).toContainEqual(tombstone('planItems', 'deleted-plan', newer));
    expect(merged.plan.tombstones.puts).toEqual([tombstone('planItems', 'deleted-plan', newer)]);
  });

  it('rescues a deleted member or category still referenced by a surviving live record', () => {
    const local = household({
      members: [], categories: [],
      tombstones: [tombstone('members', 'member-a', newer), tombstone('categories', 'category-a', newer)],
    });
    const incoming = household({
      members: [member('member-a', 'Ana', old)], categories: [category('category-a', 'Comida', old)], expenses: [expense('expense-a', newest)],
    });

    const merged = mergeHouseholds(local, incoming);

    expect(merged.result.members).toEqual([member('member-a', 'Ana', old)]);
    expect(merged.result.categories).toEqual([category('category-a', 'Comida', old)]);
    expect(merged.result.tombstones).toEqual([]);
    expect(merged.plan.tombstones.clear).toEqual([
      { table: 'members', id: 'member-a' }, { table: 'categories', id: 'category-a' },
    ]);
  });

  it('merges settings and immutable month snapshots with their specified tie breaks', () => {
    const local = household({
      settings: [{ id: 'household', splitRule: 'EQUAL_KEEP', updatedAt: newer }],
      monthSnapshots: [{ month: '2026-09', splitRule: 'EQUAL_KEEP', members: [], planItems: [], createdAt: old }],
    });
    const incoming = household({
      settings: [{ id: 'household', splitRule: 'PROPORTIONAL', updatedAt: newer }],
      monthSnapshots: [{ month: '2026-09', splitRule: 'PROPORTIONAL', members: [], planItems: [], createdAt: old }],
    });

    const result = mergeHouseholds(local, incoming).result;

    expect(result.settings[0]?.splitRule).toBe('PROPORTIONAL');
    expect(result.monthSnapshots[0]?.splitRule).toBe('EQUAL_KEEP');
    expect(mergeHouseholds(local, household({ settings: [{ id: 'household', splitRule: 'EQUAL_KEEP', updatedAt: newest }] })).result.settings[0]?.updatedAt).toBe(newest);
    expect(mergeHouseholds(local, household({
      monthSnapshots: [{ month: '2026-09', splitRule: 'PROPORTIONAL', members: [], planItems: [], createdAt: newer }],
    })).result.monthSnapshots[0]?.splitRule).toBe('EQUAL_KEEP');
  });

  it('reports writes for metadata-only changes, tombstones, and rescue, but not identical data', () => {
    const local = household();
    const settingsOnly = mergeHouseholds(local, household({ settings: [{ id: 'household', splitRule: 'PROPORTIONAL', updatedAt: newer }] }));
    const snapshotOnly = mergeHouseholds(local, household({
      monthSnapshots: [{ month: '2026-09', splitRule: 'EQUAL_KEEP', members: [], planItems: [], createdAt: old }],
    }));
    const tombstoneOnly = mergeHouseholds(local, household({ tombstones: [tombstone('expenses', 'unknown-expense', newer)] }));
    const localDeletion = household({ members: [], tombstones: [tombstone('members', 'member-a', newest)] });
    const incomingReference = household({ expenses: [expense('expense-reference', newest)] });
    const rescueOnly = mergeHouseholds(localDeletion, incomingReference);

    expect(settingsOnly.plan.summary.hasChanges).toBe(true);
    expect(snapshotOnly.plan.summary.hasChanges).toBe(true);
    expect(tombstoneOnly.plan.summary.hasChanges).toBe(true);
    expect(rescueOnly.plan.tombstones.clear).toEqual([{ table: 'members', id: 'member-a' }]);
    expect(rescueOnly.plan.summary.hasChanges).toBe(true);
    expect(mergeHouseholds(local, local).plan.summary.hasChanges).toBe(false);
  });

  it('is idempotent with settings, a rescued member, and retained tombstones', () => {
    const local = household({
      members: [member('member-a', 'Ana', old)],
      settings: [{ id: 'household', splitRule: 'EQUAL_KEEP', updatedAt: old }],
      tombstones: [tombstone('members', 'member-b', newest), tombstone('expenses', 'already-deleted', old)],
    });
    const incoming = household({
      members: [member('member-a', 'Ana editada', newer), member('member-b', 'Pareja', old)],
      expenses: [expense('expense-b', newest, 'member-b')],
      settings: [{ id: 'household', splitRule: 'PROPORTIONAL', updatedAt: newer }],
    });
    const first = mergeHouseholds(local, incoming);
    const second = mergeHouseholds(first.result, incoming);
    const third = mergeHouseholds(second.result, incoming);

    expect(first.result.members).toContainEqual(member('member-b', 'Pareja', old));
    expect(first.result.tombstones).toEqual([tombstone('expenses', 'already-deleted', old)]);
    expect(first.result.settings).toEqual(incoming.settings);
    expect(first.plan.summary.hasChanges).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(second.plan).toEqual({
      members: { puts: [], deletes: [] }, categories: { puts: [], deletes: [] },
      incomes: { puts: [], deletes: [] }, expenses: { puts: [], deletes: [] },
      planItems: { puts: [], deletes: [] }, settings: { puts: [], deletes: [] },
      monthSnapshots: { puts: [], deletes: [] },
      tombstones: { puts: [], clear: [] },
      summary: { created: 0, updated: 0, deleted: 0, hasChanges: false },
    });
    expect(third.plan.summary.hasChanges).toBe(false);
    expect(third.plan).toEqual(second.plan);
  });

  it('converges across all tables after either order of exchanging edits, deletions, and new records', () => {
    const local = household({
      members: [member('member-a', 'Ana local', newer), member('member-b', 'Berta', old)],
      categories: [category('category-a', 'Local', newer), category('category-local', 'Local only', old)],
      incomes: [income('income-conflict', 'member-a', newer), income('income-local', 'member-b', newer)],
      expenses: [expense('expense-local', newer), expense('expense-conflict', newer)],
      planItems: [planItem('plan-conflict', 'Plan local', newer), planItem('plan-local', 'Plan local only', newer, 'member-a')],
      settings: [{ id: 'household', splitRule: 'EQUAL_KEEP', updatedAt: newer }],
      monthSnapshots: [{ month: '2026-09', splitRule: 'EQUAL_KEEP', members: [], planItems: [], createdAt: newer }],
      tombstones: [
        tombstone('expenses', 'expense-remote-delete', newest),
        tombstone('categories', 'category-remote-delete', newer),
        tombstone('incomes', 'income-remote-delete', newer),
        tombstone('planItems', 'plan-remote-delete', newer),
        tombstone('members', 'member-rescued', newest),
        tombstone('categories', 'category-rescued', newest),
      ],
    });
    const incoming = household({
      members: [member('member-a', 'Ana remota', newest), member('member-b', 'Berta remota', newer), member('member-c', 'Celia', newer), member('member-rescued', 'Rescatada', old)],
      categories: [category('category-a', 'Remota', newest), category('category-remote', 'Remota only', newer), category('category-remote-delete', 'Deleted locally', old), category('category-rescued', 'Rescatada', old)],
      incomes: [income('income-conflict', 'member-a', newest), income('income-remote', 'member-c', newer), income('income-remote-delete', 'member-c', old)],
      expenses: [
        expense('expense-remote', newer, 'member-c', 'category-remote'), expense('expense-conflict', newest), expense('expense-remote-delete', old),
        expense('expense-rescue', newest, 'member-rescued', 'category-rescued'),
      ],
      planItems: [planItem('plan-conflict', 'Plan remote', newest), planItem('plan-remote', 'Plan remote only', newer, 'member-c'), planItem('plan-remote-delete', 'Deleted locally', old)],
      settings: [{ id: 'household', splitRule: 'PROPORTIONAL', updatedAt: newest }],
      monthSnapshots: [{ month: '2026-09', splitRule: 'PROPORTIONAL', members: [], planItems: [], createdAt: old }],
      tombstones: [
        tombstone('expenses', 'expense-local', newest),
        tombstone('categories', 'category-local', newest),
        tombstone('incomes', 'income-local', newest),
        tombstone('planItems', 'plan-local', newest),
      ],
    });

    const localReceivesRemote = mergeHouseholds(local, incoming).result;
    const remoteReceivesMergedLocal = mergeHouseholds(incoming, localReceivesRemote).result;
    const reverseRemoteReceivesLocal = mergeHouseholds(incoming, local).result;
    const localReceivesMergedRemote = mergeHouseholds(local, reverseRemoteReceivesLocal).result;

    expect(remoteReceivesMergedLocal).toEqual(localReceivesMergedRemote);
    expect(remoteReceivesMergedLocal).toEqual(mergeHouseholds(localReceivesRemote, remoteReceivesMergedLocal).result);
    expect(remoteReceivesMergedLocal.members).toContainEqual(member('member-a', 'Ana remota', newest));
    expect(remoteReceivesMergedLocal.members).toContainEqual(member('member-rescued', 'Rescatada', old));
    expect(remoteReceivesMergedLocal.categories).toContainEqual(category('category-rescued', 'Rescatada', old));
    expect(remoteReceivesMergedLocal.expenses).toContainEqual(expense('expense-rescue', newest, 'member-rescued', 'category-rescued'));
    expect(remoteReceivesMergedLocal.settings).toEqual([{ id: 'household', splitRule: 'PROPORTIONAL', updatedAt: newest }]);
    expect(remoteReceivesMergedLocal.tombstones).not.toContainEqual(tombstone('members', 'member-rescued', newest));
    expect(remoteReceivesMergedLocal.tombstones).not.toContainEqual(tombstone('categories', 'category-rescued', newest));
    expect(remoteReceivesMergedLocal.tombstones).toContainEqual(tombstone('expenses', 'expense-local', newest));
    expect(Object.keys(remoteReceivesMergedLocal)).toEqual([
      'members', 'categories', 'incomes', 'expenses', 'planItems', 'settings', 'monthSnapshots', 'tombstones',
    ]);
  });

  it('counts only added records, changed local rows, and local rows removed by tombstones', () => {
    const local = household({
      members: [member('member-a', 'Antes', old)],
      expenses: [expense('expense-delete', old)],
    });
    const incoming = household({
      members: [member('member-a', 'Después', newer), member('member-b', 'Nueva', newer)],
      expenses: [], tombstones: [tombstone('expenses', 'expense-delete', newer)],
    });

    expect(mergeHouseholds(local, incoming).plan.summary).toEqual({ created: 1, updated: 1, deleted: 1, hasChanges: true });
  });

  it('rejects unrelated non-empty households', () => {
    expect(() => mergeHouseholds(
      household({ members: [member('member-a', 'Ana', old)] }),
      household({ members: [member('member-b', 'Berta', old)] }),
    )).toThrow(expect.objectContaining({ failure: 'HOUSEHOLD_UNRELATED' }));
  });

  it('accepts a related household when the only shared member id is tombstoned on one side', () => {
    const local = household({ members: [member('member-a', 'Ana', old)] });
    const incoming = household({ members: [], tombstones: [tombstone('members', 'member-a', newer)] });

    expect(() => mergeHouseholds(local, incoming)).not.toThrow();
    const localTombstone = household({ members: [], tombstones: [tombstone('members', 'member-a', newer)] });
    expect(() => mergeHouseholds(localTombstone, household())).not.toThrow();
  });
});
