import { z } from 'zod';
import { MAX_HOUSEHOLD_FILE_BYTES, HouseholdArchiveError, type HouseholdArchiveReadResult, type ParsedHousehold } from '../../application/ports/household-archive.ts';
import { categoryFromRecord, expenseFromRecord, incomeFromRecord, memberFromRecord, monthSnapshotFromRecord, planItemFromRecord, settingsFromRecord } from '../database/mappers.ts';
import { CURRENT_DB_VERSION } from '../database/migrations.ts';
import type { CategoryRecord, ExpenseRecord, IncomeRecord, MemberRecord, MonthSnapshotRecord, PlanItemRecord, SettingsRecord, TombstoneRecord } from '../database/records.ts';

const stringSchema = z.string();
const integerSchema = z.number().int();
const booleanSchema = z.boolean();
const nullableStringSchema = stringSchema.nullable();
const moneyRecordSchema = z.object({ amountMinor: integerSchema, currency: stringSchema }).strict();
const memberRecordSchema = z.object({
  id: stringSchema, name: stringSchema, active: booleanSchema, referenceIncome: moneyRecordSchema.nullable(), color: stringSchema, createdAt: stringSchema, updatedAt: stringSchema,
}).strict();
const categoryRecordSchema = z.object({
  id: stringSchema, name: stringSchema, archived: booleanSchema, createdAt: stringSchema, updatedAt: stringSchema,
}).strict();
const incomeRecordSchema = z.object({
  id: stringSchema, memberId: stringSchema, amountMinor: integerSchema, currency: stringSchema, date: stringSchema,
  scheduleKind: z.enum(['MONTHLY', 'ONE_OFF']), variability: z.enum(['FIXED', 'VARIABLE']).nullable(),
  source: stringSchema, description: stringSchema, notes: stringSchema, createdAt: stringSchema, updatedAt: stringSchema,
}).strict().refine((row) => row.scheduleKind === 'MONTHLY' ? row.variability !== null : row.variability === null);
const expenseRecordSchema = z.object({
  id: stringSchema, description: stringSchema, merchant: nullableStringSchema, amountMinor: integerSchema, currency: stringSchema, date: stringSchema,
  categoryId: stringSchema, expenseType: stringSchema, scopeType: z.enum(['SHARED', 'INDIVIDUAL']), ownerId: nullableStringSchema, paidBy: stringSchema,
  recurrence: z.union([
    z.object({ frequency: z.literal('WEEKLY'), dayOfWeek: integerSchema }).strict(),
    z.object({ frequency: z.literal('MONTHLY'), dayOfMonth: integerSchema }).strict(),
    z.object({ frequency: z.literal('YEARLY'), month: integerSchema, day: integerSchema }).strict(),
  ]).nullable(),
  notes: stringSchema, receiptId: nullableStringSchema, createdAt: stringSchema, updatedAt: stringSchema,
}).strict().refine((row) => row.scopeType === 'SHARED' ? row.ownerId === null : row.ownerId !== null);
const planItemRecordSchema = z.object({
  id: stringSchema, name: stringSchema, kind: z.enum(['FORMULA', 'ASSIGNED']), currency: stringSchema, amountMinor: integerSchema.nullable(),
  shares: z.array(z.object({ memberId: stringSchema, amountMinor: integerSchema }).strict()), createdAt: stringSchema, updatedAt: stringSchema,
}).strict().refine((row) => row.kind === 'FORMULA' ? row.amountMinor !== null && row.shares.length === 0 : row.amountMinor === null);
const snapshotRecordSchema = z.object({
  month: stringSchema, splitRule: stringSchema,
  members: z.array(z.object({ id: stringSchema, active: booleanSchema, referenceIncome: moneyRecordSchema.nullable() }).strict()),
  planItems: z.array(planItemRecordSchema), createdAt: stringSchema,
}).strict();
const settingsRecordSchema = z.object({ id: z.literal('household'), splitRule: stringSchema, updatedAt: stringSchema.optional() }).strict();
const tombstoneRecordSchema = z.object({
  table: z.enum(['members', 'categories', 'incomes', 'expenses', 'planItems']), id: stringSchema, deletedAt: stringSchema,
}).strict();

const dataSchema = z.object({
  members: z.array(memberRecordSchema).optional(), categories: z.array(categoryRecordSchema).optional(),
  incomes: z.array(incomeRecordSchema).optional(), expenses: z.array(expenseRecordSchema).optional(),
  planItems: z.array(planItemRecordSchema).optional(), settings: z.array(settingsRecordSchema).optional(),
  monthSnapshots: z.array(snapshotRecordSchema).optional(),
  tombstones: z.array(tombstoneRecordSchema).optional(),
}).strict().transform((data) => ({
  members: data.members ?? [], categories: data.categories ?? [], incomes: data.incomes ?? [], expenses: data.expenses ?? [],
  planItems: data.planItems ?? [], settings: data.settings ?? [], monthSnapshots: data.monthSnapshots ?? [], tombstones: data.tombstones ?? [],
}));

const fileSchema = z.object({
  format: z.literal('family-finance-household'), formatVersion: z.literal(1), dbVersion: z.number().int().positive(),
  appVersion: stringSchema, createdAt: stringSchema, data: dataSchema,
}).strict();
export interface HouseholdFileData {
  readonly members: readonly MemberRecord[];
  readonly categories: readonly CategoryRecord[];
  readonly incomes: readonly IncomeRecord[];
  readonly expenses: readonly ExpenseRecord[];
  readonly planItems: readonly PlanItemRecord[];
  readonly settings: readonly SettingsRecord[];
  readonly monthSnapshots: readonly MonthSnapshotRecord[];
  readonly tombstones: readonly TombstoneRecord[];
}

const TOMBSTONE_TABLES = ['members', 'categories', 'incomes', 'expenses', 'planItems'] as const;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isIsoUtcTimestamp(value: string): boolean {
  if (!ISO_UTC_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function uniqueById<T extends { readonly id: string }>(rows: readonly T[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error('Duplicate record id.');
    ids.add(row.id);
  }
  return ids;
}

export function validateHouseholdData(data: HouseholdFileData): void {
  const memberIds = uniqueById(data.members);
  const categoryIds = uniqueById(data.categories);
  uniqueById(data.incomes);
  uniqueById(data.expenses);
  uniqueById(data.planItems);
  if (data.settings.length > 1) throw new Error('Duplicate household settings.');
  const snapshotMonths = new Set<string>();

  data.members.forEach(memberFromRecord);
  data.categories.forEach(categoryFromRecord);
  data.incomes.forEach((row) => {
    incomeFromRecord(row);
    if (!memberIds.has(row.memberId)) throw new Error('Income refers to an unknown member.');
  });
  data.expenses.forEach((row) => {
    expenseFromRecord(row);
    if (!memberIds.has(row.paidBy) || (row.ownerId !== null && !memberIds.has(row.ownerId)) || !categoryIds.has(row.categoryId)) {
      throw new Error('Expense refers to an unknown record.');
    }
    if (row.receiptId !== null) throw new Error('Receipt references are unsupported.');
  });
  data.planItems.forEach((row) => {
    planItemFromRecord(row);
    if (row.shares.some((share) => !memberIds.has(share.memberId))) throw new Error('Plan item refers to an unknown member.');
  });
  data.settings.forEach((row) => {
    settingsFromRecord(row);
    if (!isIsoUtcTimestamp(row.updatedAt)) throw new Error('Invalid household settings timestamp.');
  });
  data.monthSnapshots.forEach((row) => {
    monthSnapshotFromRecord(row);
    if (snapshotMonths.has(row.month)) throw new Error('Duplicate month snapshot.');
    snapshotMonths.add(row.month);
    uniqueById(row.planItems);
    const snapshotMembers = new Set(row.members.map((member) => member.id));
    if (snapshotMembers.size !== row.members.length || row.planItems.some((item) => item.shares.some((share) => !snapshotMembers.has(share.memberId)))) {
      throw new Error('Snapshot refers to an unknown or duplicate member.');
    }
  });

  const liveIds: Record<(typeof TOMBSTONE_TABLES)[number], Set<string>> = {
    members: memberIds,
    categories: categoryIds,
    incomes: new Set(data.incomes.map((row) => row.id)),
    expenses: new Set(data.expenses.map((row) => row.id)),
    planItems: new Set(data.planItems.map((row) => row.id)),
  };
  const deletedIds = new Set<string>();
  data.tombstones.forEach((tombstone) => {
    if (!TOMBSTONE_TABLES.includes(tombstone.table) || !isIsoUtcTimestamp(tombstone.deletedAt)) {
      throw new Error('Invalid tombstone.');
    }
    const key = `${tombstone.table}\u0000${tombstone.id}`;
    if (deletedIds.has(key) || liveIds[tombstone.table].has(tombstone.id)) throw new Error('Conflicting tombstone.');
    deletedIds.add(key);
  });
}

export function serializeHousehold(data: HouseholdFileData, createdAt = new Date()): string {
  return JSON.stringify({
    format: 'family-finance-household',
    formatVersion: 1,
    dbVersion: CURRENT_DB_VERSION,
    appVersion: '0.1.0',
    createdAt: createdAt.toISOString(),
    data,
  });
}

export function parseHouseholdFile(text: string): HouseholdArchiveReadResult {
  if (text.length > MAX_HOUSEHOLD_FILE_BYTES || new TextEncoder().encode(text).byteLength > MAX_HOUSEHOLD_FILE_BYTES) throw new HouseholdArchiveError('INVALID_FILE');
  let raw: unknown;
  let normalizedData: HouseholdFileData;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HouseholdArchiveError('INVALID_FILE');
  }
  if (raw !== null && typeof raw === 'object') {
    const header = raw as Record<string, unknown>;
    if (typeof header['dbVersion'] === 'number' && header['dbVersion'] > CURRENT_DB_VERSION) {
      throw new HouseholdArchiveError('NEWER_DATABASE');
    }
  }
  const result = fileSchema.safeParse(raw);
  if (!result.success) throw new HouseholdArchiveError('INVALID_FILE');
  const serializedData = raw !== null && typeof raw === 'object' && 'data' in raw ? raw.data : undefined;
  const requiredTables = ['members', 'categories', 'incomes', 'expenses', 'planItems', 'settings', 'monthSnapshots', ...(result.data.dbVersion >= 3 ? ['tombstones'] : [])];
  if (result.data.dbVersion >= 3 && serializedData !== null && typeof serializedData === 'object'
    && requiredTables.some((table) => !Object.hasOwn(serializedData, table))) {
    throw new HouseholdArchiveError('INVALID_FILE');
  }
  try {
    const data = result.data.data;
    if (result.data.dbVersion >= 4 && data.settings.some((row) => !Object.hasOwn(row, 'updatedAt'))) {
      throw new Error('Version 4 settings require an update timestamp.');
    }
    normalizedData = {
      ...data,
      settings: data.settings.map((row) => ({ ...row, updatedAt: row.updatedAt ?? '1970-01-01T00:00:00.000Z' })),
    } as unknown as HouseholdFileData;
    validateHouseholdData(normalizedData);
  } catch {
    throw new HouseholdArchiveError('INVALID_FILE');
  }
  const { members, incomes, expenses, planItems } = normalizedData;
  const dates = [...incomes.map((row) => row.date), ...expenses.map((row) => row.date)].sort();
  const from = dates.at(0);
  const to = dates.at(-1);
  const parsed = normalizedData as unknown as ParsedHousehold;
  return {
    parsed,
    summary: {
      memberNames: members.map((member) => member.name),
      expenses: expenses.length,
      incomes: incomes.length,
      planItems: planItems.length,
      dateRange: from && to ? { from, to } : null,
    },
  };
}
