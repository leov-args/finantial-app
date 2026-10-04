import { DomainError } from '../shared/errors.ts';
import type { Timestamp } from '../shared/dates.ts';
import type { MemberId } from '../shared/ids.ts';
import { TEXT_LIMITS, requireName } from '../shared/text.ts';
import { type Money, isNegative } from '../money/money.ts';

/**
 * Closed palette a member picks from (A6). Keys only: the UI owns the actual
 * light/dark values. Green and red are left out on purpose, they mean
 * "saving / it adds up" and "error / negative".
 */
export const MEMBER_COLORS = ['blue', 'indigo', 'purple', 'pink', 'orange', 'teal', 'mint', 'brown'] as const;
export type MemberColor = (typeof MEMBER_COLORS)[number];

export const isMemberColor = (value: string): value is MemberColor => (MEMBER_COLORS as readonly string[]).includes(value);

/**
 * A person in the household. The model never assumes a fixed number of
 * members or any particular names: everything that splits money works on
 * a list of members.
 *
 * Members are deactivated, not deleted, once they have financial history,
 * so past expenses and contributions keep pointing at a real person.
 */
export interface Member {
  readonly id: MemberId;
  readonly name: string;
  readonly active: boolean;
  /** Monthly income used by the family split (A2). null = not part of the split. */
  readonly referenceIncome: Money | null;
  readonly color: MemberColor;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** Validates every invariant; used on creation, on change and when reading records. */
export function buildMember(props: Member): Member {
  if (!isMemberColor(props.color)) {
    throw new DomainError('INVALID_MEMBER', `Unknown member color "${String(props.color)}".`);
  }
  if (props.referenceIncome && isNegative(props.referenceIncome)) {
    throw new DomainError('INVALID_MEMBER', 'Reference income must not be negative.');
  }
  return Object.freeze({
    id: props.id,
    name: requireName(props.name, TEXT_LIMITS.name, 'Member name'),
    active: props.active,
    referenceIncome: props.referenceIncome,
    color: props.color,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  });
}

export interface NewMember {
  readonly id: MemberId;
  readonly name: string;
  readonly color: MemberColor;
  readonly active?: boolean;
  readonly now: Timestamp;
}

export function createMember(input: NewMember): Member {
  return buildMember({
    id: input.id,
    name: input.name,
    active: input.active ?? true,
    referenceIncome: null,
    color: input.color,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function renameMember(member: Member, name: string, now: Timestamp): Member {
  return buildMember({ ...member, name, updatedAt: now });
}

export function setMemberActive(member: Member, active: boolean, now: Timestamp): Member {
  return member.active === active ? member : buildMember({ ...member, active, updatedAt: now });
}

export function setReferenceIncome(member: Member, referenceIncome: Money | null, now: Timestamp): Member {
  return buildMember({ ...member, referenceIncome, updatedAt: now });
}

export function setMemberColor(member: Member, color: MemberColor, now: Timestamp): Member {
  return member.color === color ? member : buildMember({ ...member, color, updatedAt: now });
}

export const activeMembers = (members: readonly Member[]): Member[] => members.filter((m) => m.active);

/** First palette color no active member uses (A6). */
export function firstFreeColor(members: readonly Member[]): MemberColor {
  const used = new Set(activeMembers(members).map((m) => m.color));
  // ponytail: with more than 8 active members colors repeat; the spec caps households at 4.
  return MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[activeMembers(members).length % MEMBER_COLORS.length] ?? 'blue';
}
