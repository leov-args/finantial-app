import { describe, expect, it } from 'vitest';
import { T0, T1, ANA } from '../../test/fixtures.ts';
import { money } from '../money/money.ts';
import {
  activeMembers,
  createMember,
  firstFreeColor,
  renameMember,
  setMemberActive,
  setMemberColor,
  setReferenceIncome,
} from './member.ts';

describe('Member', () => {
  it('creates an active member with a normalised name', () => {
    const m = createMember({ id: ANA, name: '  Ana   García ', color: 'blue', now: T0 });
    expect(m).toEqual({
      id: ANA,
      name: 'Ana García',
      active: true,
      referenceIncome: null,
      color: 'blue',
      createdAt: T0,
      updatedAt: T0,
    });
  });

  it('rejects empty and too long names', () => {
    expect(() => createMember({ id: ANA, name: '   ', color: 'blue', now: T0 })).toThrow(/empty/);
    expect(() => createMember({ id: ANA, name: 'x'.repeat(61), color: 'blue', now: T0 })).toThrow(/60/);
  });

  it('renames and deactivates immutably', () => {
    const m = createMember({ id: ANA, name: 'Ani', color: 'blue', now: T0 });
    const renamed = renameMember(m, 'Ana', T1);
    expect(renamed.name).toBe('Ana');
    expect(renamed.updatedAt).toBe(T1);
    expect(m.name).toBe('Ani');
    const inactive = setMemberActive(renamed, false, T1);
    expect(activeMembers([m, inactive])).toEqual([m]);
    expect(setMemberActive(m, true, T1)).toBe(m);
  });

  it('is not limited to two members', () => {
    const members = ['A', 'B', 'C', 'D'].map((name, i) =>
      createMember({ id: `m${i}` as typeof ANA, name, color: 'blue', now: T0 }),
    );
    expect(activeMembers(members)).toHaveLength(4);
  });

  it('A2: sets and clears the reference income, never negative', () => {
    const m = createMember({ id: ANA, name: 'Ani', color: 'blue', now: T0 });
    const withIncome = setReferenceIncome(m, money(260000, 'EUR'), T1);
    expect(withIncome.referenceIncome).toEqual(money(260000, 'EUR'));
    expect(setReferenceIncome(withIncome, null, T1).referenceIncome).toBeNull();
    expect(setReferenceIncome(m, money(0, 'EUR'), T1).referenceIncome).toEqual(money(0, 'EUR'));
    expect(() => setReferenceIncome(m, money(-1, 'EUR'), T1)).toThrow(/negative/);
  });

  it('A6: only accepts palette colors and hands out the first free one', () => {
    const blue = createMember({ id: ANA, name: 'Ani', color: 'blue', now: T0 });
    expect(() => setMemberColor(blue, 'green' as 'blue', T1)).toThrow(/color/);
    const indigo = setMemberColor(blue, 'indigo', T1);
    expect(indigo.color).toBe('indigo');
    expect(firstFreeColor([])).toBe('blue');
    expect(firstFreeColor([blue, { ...indigo, id: 'm2' as typeof ANA }])).toBe('purple');
    // Inactive members free their color.
    expect(firstFreeColor([setMemberActive(blue, false, T1)])).toBe('blue');
  });
});
