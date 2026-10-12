import { describe, expect, it } from 'vitest';
import { asTimestamp } from '../../domain/shared/dates.ts';
import { CURRENT_DB_VERSION } from '../database/migrations.ts';
import { parseHouseholdFile, serializeHousehold } from './household-file.ts';

const member = {
  id: 'member-ana',
  name: 'Ana',
  active: true,
  referenceIncome: null,
  color: 'blue',
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};
const category = {
  id: 'category-food',
  name: 'Comida',
  archived: false,
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};
const data = {
  members: [member],
  categories: [category],
  incomes: [],
  expenses: [],
  planItems: [],
  settings: [],
  monthSnapshots: [],
  tombstones: [],
};
const householdFile = (overrides: Record<string, unknown> = {}) => ({
  format: 'family-finance-household',
  formatVersion: 1,
  dbVersion: CURRENT_DB_VERSION,
  appVersion: '0.1.0',
  createdAt: '2026-10-02T10:00:00.000Z',
  data,
  ...overrides,
});

const invalid = expect.objectContaining({ failure: 'INVALID_FILE' });

describe('household file', () => {
  it('serializes records and reads back a validated summary', () => {
    const text = serializeHousehold(data, new Date('2026-10-11T10:00:00.000Z'));
    const parsed = parseHouseholdFile(text);

    expect(JSON.parse(text)).toMatchObject({
      format: 'family-finance-household',
      formatVersion: 1,
      dbVersion: CURRENT_DB_VERSION,
      data,
    });
    expect(CURRENT_DB_VERSION).toBe(4);
    expect(Object.keys((JSON.parse(text) as { data: Record<string, unknown> }).data)).toEqual(Object.keys(data));
    expect(parsed.summary).toEqual({
      memberNames: ['Ana'],
      expenses: 0,
      incomes: 0,
      planItems: 0,
      dateRange: null,
    });
  });

  it('rejects invalid JSON and a different format', () => {
    expect(() => parseHouseholdFile('{')).toThrow(invalid);
    expect(() => parseHouseholdFile(JSON.stringify(householdFile({ format: 'other' })))).toThrow(invalid);
    expect(() => parseHouseholdFile(JSON.stringify(householdFile({ formatVersion: 2 })))).toThrow(invalid);
  });

  it('rejects newer database versions and oversized files', () => {
    expect(() => parseHouseholdFile(JSON.stringify(householdFile({
      dbVersion: CURRENT_DB_VERSION + 1,
      data: { members: [{ futureField: true }] },
    })))).toThrow(expect.objectContaining({ failure: 'NEWER_DATABASE' }));
    const padded = JSON.stringify(householdFile()) + ' '.repeat(20 * 1024 * 1024);
    expect(() => parseHouseholdFile(padded)).toThrow(expect.objectContaining({ failure: 'INVALID_FILE' }));
  });

  it('accepts the base the rejection cases mutate', () => {
    rejectedFiles();
    expect(() => parseHouseholdFile(JSON.stringify(validBase))).not.toThrow();
  });

  it.each(rejectedFiles())('rejects $name', ({ file }) => {
    expect(() => parseHouseholdFile(JSON.stringify(file))).toThrow(invalid);
  });

  it('treats tables absent from an older database version as empty', () => {
    const olderData = {
      members: data.members, categories: data.categories, incomes: data.incomes, expenses: data.expenses,
      planItems: data.planItems, settings: data.settings,
    };
    expect(() => parseHouseholdFile(JSON.stringify(householdFile({ dbVersion: 2, data: olderData })))).not.toThrow();
    expect(() => parseHouseholdFile(JSON.stringify(householdFile({ data: olderData })))).toThrow();
    expect(parseHouseholdFile(JSON.stringify(householdFile({ dbVersion: 2, data: olderData }))).parsed).toMatchObject({ tombstones: [] });
  });

  it('requires tombstones in a v3 file', () => {
    const { tombstones, ...v3Data } = data;
    expect(tombstones).toEqual([]);
    expect(() => parseHouseholdFile(JSON.stringify(householdFile({ data: v3Data })))).toThrow(invalid);
  });

  it('fills missing settings timestamps in older files and requires them in v4 files', () => {
    const oldSettings = [{ id: 'household', splitRule: 'PROPORTIONAL' }];
    const v3 = parseHouseholdFile(JSON.stringify(householdFile({ dbVersion: 3, data: { ...data, settings: oldSettings } })));
    expect(v3.parsed).toMatchObject({ settings: [{ ...oldSettings[0], updatedAt: '1970-01-01T00:00:00.000Z' }] });

    expect(() => parseHouseholdFile(JSON.stringify(householdFile({ data: { ...data, settings: oldSettings } })))).toThrow(invalid);
    expect(() => parseHouseholdFile(JSON.stringify(householdFile({ data: { ...data, settings: [{ ...oldSettings[0], updatedAt: 'not-a-time' }] } })))).toThrow(invalid);
  });

  it('round-trips tombstones from the household file', () => {
    const tombstones = [{ table: 'members' as const, id: 'deleted-member', deletedAt: asTimestamp('2026-10-02T10:00:00.000Z') }];
    const text = serializeHousehold({ ...data, tombstones }, new Date('2026-10-11T10:00:00.000Z'));

    expect(JSON.parse(text)).toMatchObject({ data: { tombstones } });
    expect(parseHouseholdFile(text).parsed).toMatchObject({ tombstones });
  });

  it.each([
    ['unknown table', [{ table: 'settings', id: 'deleted', deletedAt: '2026-10-02T10:00:00.000Z' }]],
    ['invalid UTC timestamp', [{ table: 'members', id: 'deleted', deletedAt: '2026-10-02T10:00:00+01:00' }]],
    ['duplicate table and id', [
      { table: 'members', id: 'deleted', deletedAt: '2026-10-02T10:00:00.000Z' },
      { table: 'members', id: 'deleted', deletedAt: '2026-10-03T10:00:00.000Z' },
    ]],
    ['a tombstone for a live record', [{ table: 'members', id: member.id, deletedAt: '2026-10-02T10:00:00.000Z' }]],
  ])('rejects tombstones with %s', (_name, tombstones) => {
    expect(() => parseHouseholdFile(JSON.stringify(householdFile({ data: { ...data, tombstones } })))).toThrow(invalid);
  });
});

let validBase: ReturnType<typeof householdFile>;

function rejectedFiles(): { name: string; file: ReturnType<typeof householdFile> }[] {
  const stamps = { createdAt: member.createdAt, updatedAt: member.updatedAt };
  const expense = {
    id: 'expense-1', description: 'Café', merchant: null, amountMinor: 300, currency: 'EUR', date: '2026-10-01',
    categoryId: category.id, expenseType: 'VARIABLE', scopeType: 'SHARED', ownerId: null, paidBy: member.id,
    recurrence: null, notes: '', receiptId: null, ...stamps,
  };
  const income = {
    id: 'income-1', memberId: member.id, amountMinor: 1000, currency: 'EUR', date: '2026-10-01',
    scheduleKind: 'ONE_OFF', variability: null, source: 'OTHER', description: '', notes: '', ...stamps,
  };
  const line = (id: string, shares: { memberId: string; amountMinor: number }[]) => ({
    id, name: 'Alquiler', kind: 'ASSIGNED', currency: 'EUR', amountMinor: null, shares, ...stamps,
  });
  const snapshot = (month: string, shares: { memberId: string; amountMinor: number }[]) => ({
    month, splitRule: 'PROPORTIONAL', createdAt: member.createdAt,
    members: [{ id: member.id, active: true, referenceIncome: null }], planItems: [line('snap-line', shares)],
  });
  const withData = (patch: Record<string, unknown>) => householdFile({ data: { ...data, ...patch } });
  validBase = withData({ expenses: [expense], incomes: [income], planItems: [line('l', [{ memberId: member.id, amountMinor: 1000 }])], monthSnapshots: [snapshot('2026-09', [{ memberId: member.id, amountMinor: 1000 }])] });
  return [
    { name: 'duplicate member ids', file: withData({ members: [member, member] }) },
    { name: 'duplicate expense ids', file: withData({ expenses: [expense, expense] }) },
    { name: 'duplicate income ids', file: withData({ incomes: [income, income] }) },
    { name: 'duplicate plan item ids', file: withData({ planItems: [line('l', []), line('l', [])] }) },
    { name: 'duplicate month snapshots', file: withData({ monthSnapshots: [snapshot('2026-09', []), snapshot('2026-09', [])] }) },
    { name: 'an invalid member color', file: withData({ members: [{ ...member, color: 'invalid' }] }) },
    { name: 'an expense paid by an unknown member', file: withData({ expenses: [{ ...expense, paidBy: 'missing' }] }) },
    { name: 'an expense with an unknown category', file: withData({ expenses: [{ ...expense, categoryId: 'missing' }] }) },
    { name: 'an expense owned by an unknown member', file: withData({ expenses: [{ ...expense, scopeType: 'INDIVIDUAL', ownerId: 'missing' }] }) },
    { name: 'an individual expense without owner', file: withData({ expenses: [{ ...expense, scopeType: 'INDIVIDUAL', ownerId: null }] }) },
    { name: 'an expense with a receipt', file: withData({ expenses: [{ ...expense, receiptId: 'r1' }] }) },
    { name: 'an income of an unknown member', file: withData({ incomes: [{ ...income, memberId: 'missing' }] }) },
    { name: 'a plan share of an unknown member', file: withData({ planItems: [line('l', [{ memberId: 'missing', amountMinor: 1000 }])] }) },
    { name: 'a snapshot share of a member missing from the snapshot', file: withData({ monthSnapshots: [snapshot('2026-09', [{ memberId: 'missing', amountMinor: 1000 }])] }) },
    { name: 'more than one settings row', file: withData({ settings: [
      { id: 'household', splitRule: 'PROPORTIONAL', updatedAt: member.updatedAt },
      { id: 'household', splitRule: 'EQUAL_KEEP', updatedAt: member.updatedAt },
    ] }) },
  ];
}
