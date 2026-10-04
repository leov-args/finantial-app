/**
 * Shapes stored in IndexedDB. They are deliberately flat, JSON-compatible
 * and decoupled from domain types:
 *  - money is split into amountMinor + currency (indexable, no class instances)
 *  - discriminated unions are flattened where a field must be indexed (ownerId)
 *  - every field is present (null instead of undefined) so backups are stable
 *
 * Changing a record shape REQUIRES a new database version and a migration
 * (see migrations.ts and docs/storage.md).
 */
import type { Recurrence } from '../../domain/expense/expense.ts';

export interface MoneyRecord {
  amountMinor: number;
  currency: string;
}

export interface MemberRecord {
  id: string;
  name: string;
  active: boolean;
  referenceIncome: MoneyRecord | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeRecord {
  id: string;
  memberId: string;
  amountMinor: number;
  currency: string;
  date: string;
  scheduleKind: 'MONTHLY' | 'ONE_OFF';
  /** null when scheduleKind is ONE_OFF. */
  variability: 'FIXED' | 'VARIABLE' | null;
  source: string;
  description: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  description: string;
  merchant: string | null;
  amountMinor: number;
  currency: string;
  date: string;
  categoryId: string;
  expenseType: string;
  scopeType: 'SHARED' | 'INDIVIDUAL';
  /** null for SHARED expenses. Indexed (IndexedDB skips null keys). */
  ownerId: string | null;
  paidBy: string;
  recurrence: Recurrence | null;
  notes: string;
  receiptId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanItemRecord {
  id: string;
  name: string;
  kind: 'FORMULA' | 'ASSIGNED';
  currency: string;
  /** FORMULA only; null for ASSIGNED (its amount is the sum of the shares). */
  amountMinor: number | null;
  /** ASSIGNED only; empty for FORMULA. */
  shares: { memberId: string; amountMinor: number }[];
  createdAt: string;
  updatedAt: string;
}

/** Household-wide settings; a single row with id "household". */
export interface SettingsRecord {
  id: 'household';
  splitRule: string;
}
