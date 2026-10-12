import type { CategoryRecord, ExpenseRecord, IncomeRecord, MemberRecord, MonthSnapshotRecord, PlanItemRecord, SettingsRecord, TombstoneRecord } from '../database/records.ts';
import type { HouseholdFileData } from './household-file.ts';

export type MergeableTable = 'members' | 'categories' | 'incomes' | 'expenses' | 'planItems';

interface MergeCounts {
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
}

export interface MergeSummary extends MergeCounts {
  readonly hasChanges: boolean;
}

export interface HouseholdMergePlan {
  readonly members: { readonly puts: readonly MemberRecord[]; readonly deletes: readonly string[] };
  readonly categories: { readonly puts: readonly CategoryRecord[]; readonly deletes: readonly string[] };
  readonly incomes: { readonly puts: readonly IncomeRecord[]; readonly deletes: readonly string[] };
  readonly expenses: { readonly puts: readonly ExpenseRecord[]; readonly deletes: readonly string[] };
  readonly planItems: { readonly puts: readonly PlanItemRecord[]; readonly deletes: readonly string[] };
  readonly settings: { readonly puts: readonly SettingsRecord[]; readonly deletes: readonly string[] };
  readonly monthSnapshots: { readonly puts: readonly MonthSnapshotRecord[]; readonly deletes: readonly string[] };
  readonly tombstones: {
    readonly puts: readonly TombstoneRecord[];
    readonly clear: readonly { readonly table: MergeableTable; readonly id: string }[];
  };
  readonly summary: MergeSummary;
}

export interface HouseholdMergeResult {
  readonly result: HouseholdFileData;
  readonly plan: HouseholdMergePlan;
}

export class HouseholdMergeError extends Error {
  constructor(readonly failure: 'HOUSEHOLD_UNRELATED') {
    super(failure);
    this.name = 'HouseholdMergeError';
  }
}

const RECORD_TABLES: readonly MergeableTable[] = ['members', 'categories', 'incomes', 'expenses', 'planItems'];
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function winningLive<T extends { readonly updatedAt: string }>(left: T | undefined, right: T | undefined): T | undefined {
  if (!left) return right;
  if (!right) return left;
  const time = compareText(left.updatedAt, right.updatedAt);
  if (time !== 0) return time > 0 ? left : right;
  return compareText(canonical(left), canonical(right)) >= 0 ? left : right;
}

function winnerIsTombstone<T extends { readonly updatedAt: string }>(live: T | undefined, deletedAt: string | undefined): boolean {
  if (deletedAt === undefined) return false;
  if (!live) return true;
  return compareText(deletedAt, live.updatedAt) >= 0;
}

function sortById<T extends { readonly id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => compareText(left.id, right.id));
}

function mergeEntityTable<T extends { readonly id: string; readonly updatedAt: string }>(
  table: MergeableTable,
  localRows: readonly T[],
  incomingRows: readonly T[],
  localTombstones: readonly TombstoneRecord[],
  incomingTombstones: readonly TombstoneRecord[],
): { readonly rows: T[]; readonly tombstones: TombstoneRecord[] } {
  const localById = new Map(localRows.map((row) => [row.id, row]));
  const incomingById = new Map(incomingRows.map((row) => [row.id, row]));
  const localDeletes = new Map(localTombstones.filter((item) => item.table === table).map((item) => [item.id, item.deletedAt]));
  const incomingDeletes = new Map(incomingTombstones.filter((item) => item.table === table).map((item) => [item.id, item.deletedAt]));
  const ids = new Set([...localById.keys(), ...incomingById.keys(), ...localDeletes.keys(), ...incomingDeletes.keys()]);
  const rows: T[] = [];
  const tombstones: TombstoneRecord[] = [];

  for (const id of [...ids].sort(compareText)) {
    const live = winningLive(localById.get(id), incomingById.get(id));
    const deletedAtCandidates = [localDeletes.get(id), incomingDeletes.get(id)]
      .filter((value): value is TombstoneRecord['deletedAt'] => value !== undefined);
    const deletedAt = deletedAtCandidates.sort(compareText).at(-1);
    if (winnerIsTombstone(live, deletedAt)) {
      if (deletedAt !== undefined) tombstones.push({ table, id, deletedAt });
    } else if (live) {
      rows.push(live);
    }
  }

  return { rows, tombstones };
}

function newestLive<T extends { readonly id: string; readonly updatedAt: string }>(
  id: string,
  localRows: readonly T[],
  incomingRows: readonly T[],
): T | undefined {
  return winningLive(localRows.find((row) => row.id === id), incomingRows.find((row) => row.id === id));
}

function mergeSettings(local: readonly SettingsRecord[], incoming: readonly SettingsRecord[]): SettingsRecord[] {
  const left = local[0];
  const right = incoming[0];
  if (!left) return right ? [right] : [];
  if (!right) return [left];
  const time = compareText(left.updatedAt, right.updatedAt);
  if (time !== 0) return [time > 0 ? left : right];
  return [compareText(left.splitRule, right.splitRule) >= 0 ? left : right];
}

function mergeSnapshots(local: readonly MonthSnapshotRecord[], incoming: readonly MonthSnapshotRecord[]): MonthSnapshotRecord[] {
  const byMonth = new Map<string, MonthSnapshotRecord>();
  for (const snapshot of [...local, ...incoming]) {
    const current = byMonth.get(snapshot.month);
    if (!current || snapshot.createdAt < current.createdAt
      || (snapshot.createdAt === current.createdAt && compareText(canonical(snapshot), canonical(current)) < 0)) {
      byMonth.set(snapshot.month, snapshot);
    }
  }
  return [...byMonth.values()].sort((left, right) => compareText(left.month, right.month));
}

function diffRows<T extends { readonly id: string }>(local: readonly T[], result: readonly T[]) {
  const localById = new Map(local.map((row) => [row.id, row]));
  const resultById = new Map(result.map((row) => [row.id, row]));
  return {
    puts: sortById(result.filter((row) => canonical(localById.get(row.id)) !== canonical(row))),
    deletes: [...localById.keys()].filter((id) => !resultById.has(id)).sort(compareText),
  };
}

function diffSnapshots(local: readonly MonthSnapshotRecord[], result: readonly MonthSnapshotRecord[]) {
  const localByMonth = new Map(local.map((row) => [row.month, row]));
  const resultByMonth = new Map(result.map((row) => [row.month, row]));
  return {
    puts: result.filter((row) => canonical(localByMonth.get(row.month)) !== canonical(row)),
    deletes: [...localByMonth.keys()].filter((month) => !resultByMonth.has(month)).sort(compareText),
  };
}

function tombstoneKey(table: MergeableTable, id: string): string {
  return `${table}\u0000${id}`;
}

function sortTombstones(rows: readonly TombstoneRecord[]): TombstoneRecord[] {
  const tableOrder = new Map(RECORD_TABLES.map((table, index) => [table, index]));
  return [...rows].sort((left, right) => (tableOrder.get(left.table) ?? 0) - (tableOrder.get(right.table) ?? 0) || compareText(left.id, right.id));
}

function diffTombstones(local: readonly TombstoneRecord[], result: readonly TombstoneRecord[]) {
  const localByKey = new Map(local.map((row) => [tombstoneKey(row.table, row.id), row]));
  const resultByKey = new Map(result.map((row) => [tombstoneKey(row.table, row.id), row]));
  return {
    puts: sortTombstones(result.filter((row) => canonical(localByKey.get(tombstoneKey(row.table, row.id))) !== canonical(row))),
    clear: sortTombstones(local.filter((row) => !resultByKey.has(tombstoneKey(row.table, row.id)))).map(({ table, id }) => ({ table, id })),
  };
}

function asSummary(local: HouseholdFileData, result: HouseholdFileData): MergeCounts {
  let created = 0;
  let updated = 0;
  let deleted = 0;
  for (const table of RECORD_TABLES) {
    const localRows = local[table] as readonly { readonly id: string }[];
    const resultRows = result[table] as readonly { readonly id: string }[];
    const localById = new Map(localRows.map((row) => [row.id, row]));
    const resultById = new Map(resultRows.map((row) => [row.id, row]));
    for (const row of resultRows) {
      const previous = localById.get(row.id);
      if (!previous) created += 1;
      else if (canonical(previous) !== canonical(row)) updated += 1;
    }
    for (const id of localById.keys()) if (!resultById.has(id)) deleted += 1;
  }
  return { created, updated, deleted };
}

export function mergeHouseholds(local: HouseholdFileData, incoming: HouseholdFileData): HouseholdMergeResult {
  const localMemberIds = new Set([
    ...local.members.map((member) => member.id),
    ...local.tombstones.filter((item) => item.table === 'members').map((item) => item.id),
  ]);
  const incomingMemberIds = new Set([
    ...incoming.members.map((member) => member.id),
    ...incoming.tombstones.filter((item) => item.table === 'members').map((item) => item.id),
  ]);
  if (localMemberIds.size > 0 && incomingMemberIds.size > 0
    && ![...localMemberIds].some((id) => incomingMemberIds.has(id))) {
    throw new HouseholdMergeError('HOUSEHOLD_UNRELATED');
  }

  const mergedMembers = mergeEntityTable('members', local.members, incoming.members, local.tombstones, incoming.tombstones);
  const mergedCategories = mergeEntityTable('categories', local.categories, incoming.categories, local.tombstones, incoming.tombstones);
  const mergedIncomes = mergeEntityTable('incomes', local.incomes, incoming.incomes, local.tombstones, incoming.tombstones);
  const mergedExpenses = mergeEntityTable('expenses', local.expenses, incoming.expenses, local.tombstones, incoming.tombstones);
  const mergedPlanItems = mergeEntityTable('planItems', local.planItems, incoming.planItems, local.tombstones, incoming.tombstones);

  const resultTombstones = new Map<string, TombstoneRecord>();
  for (const row of [
    ...mergedMembers.tombstones, ...mergedCategories.tombstones, ...mergedIncomes.tombstones,
    ...mergedExpenses.tombstones, ...mergedPlanItems.tombstones,
  ]) resultTombstones.set(tombstoneKey(row.table, row.id), row);

  const memberReferences = new Set<string>();
  for (const row of mergedIncomes.rows) memberReferences.add(row.memberId);
  for (const row of mergedExpenses.rows) {
    memberReferences.add(row.paidBy);
    if (row.ownerId !== null) memberReferences.add(row.ownerId);
  }
  for (const row of mergedPlanItems.rows) for (const share of row.shares) memberReferences.add(share.memberId);
  const mergedMemberIds = new Set(mergedMembers.rows.map((row) => row.id));
  for (const id of memberReferences) {
    if (mergedMemberIds.has(id)) continue;
    const deletionKey = tombstoneKey('members', id);
    if (!resultTombstones.has(deletionKey)) continue;
    const rescued = newestLive(id, local.members, incoming.members);
    if (rescued) {
      mergedMembers.rows.push(rescued);
      resultTombstones.delete(deletionKey);
    }
  }

  const categoryReferences = new Set(mergedExpenses.rows.map((row) => row.categoryId));
  const mergedCategoryIds = new Set(mergedCategories.rows.map((row) => row.id));
  for (const id of categoryReferences) {
    if (mergedCategoryIds.has(id)) continue;
    const deletionKey = tombstoneKey('categories', id);
    if (!resultTombstones.has(deletionKey)) continue;
    const rescued = newestLive(id, local.categories, incoming.categories);
    if (rescued) {
      mergedCategories.rows.push(rescued);
      resultTombstones.delete(deletionKey);
    }
  }

  const result: HouseholdFileData = {
    members: sortById(mergedMembers.rows),
    categories: sortById(mergedCategories.rows),
    incomes: sortById(mergedIncomes.rows),
    expenses: sortById(mergedExpenses.rows),
    planItems: sortById(mergedPlanItems.rows),
    settings: mergeSettings(local.settings, incoming.settings),
    monthSnapshots: mergeSnapshots(local.monthSnapshots, incoming.monthSnapshots),
    tombstones: sortTombstones([...resultTombstones.values()]),
  };

  const memberDiff = diffRows(local.members, result.members);
  const categoryDiff = diffRows(local.categories, result.categories);
  const incomeDiff = diffRows(local.incomes, result.incomes);
  const expenseDiff = diffRows(local.expenses, result.expenses);
  const planItemDiff = diffRows(local.planItems, result.planItems);
  const settingsDiff = diffRows(local.settings, result.settings);
  const snapshotDiff = diffSnapshots(local.monthSnapshots, result.monthSnapshots);
  const tombstoneDiff = diffTombstones(local.tombstones, result.tombstones);
  const changes = [
    memberDiff, categoryDiff, incomeDiff, expenseDiff, planItemDiff, settingsDiff, snapshotDiff,
    { puts: tombstoneDiff.puts, deletes: tombstoneDiff.clear },
  ];
  const summary: MergeSummary = {
    ...asSummary(local, result),
    hasChanges: changes.some(({ puts, deletes }) => puts.length > 0 || deletes.length > 0),
  };
  const plan: HouseholdMergePlan = {
    members: memberDiff,
    categories: categoryDiff,
    incomes: incomeDiff,
    expenses: expenseDiff,
    planItems: planItemDiff,
    settings: settingsDiff,
    monthSnapshots: snapshotDiff,
    tombstones: tombstoneDiff,
    summary,
  };
  return { result, plan };
}
