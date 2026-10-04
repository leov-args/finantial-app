import { asTimestamp } from '../domain/shared/dates.ts';
import { asCategoryId, asMemberId } from '../domain/shared/ids.ts';

export const T0 = asTimestamp('2026-10-02T10:00:00.000Z');
export const T1 = asTimestamp('2026-10-02T11:00:00.000Z');
export const ANA = asMemberId('m-ana');
export const PARTNER = asMemberId('m-partner');
export const FOOD = asCategoryId('cat-food');
export const HOUSING = asCategoryId('cat-housing');
