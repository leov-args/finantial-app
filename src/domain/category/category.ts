import type { Timestamp } from '../shared/dates.ts';
import { type CategoryId, asCategoryId } from '../shared/ids.ts';
import { getCurrentLocale } from '../shared/locale.ts';
import { TEXT_LIMITS, requireName } from '../shared/text.ts';

/**
 * Expense category. Names are user data and business rules do not branch on
 * them. The stable `cat-other` id is the one exception: application setup
 * protects it as the assistant's always-active fallback category.
 */
export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  readonly archived: boolean;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface NewCategory {
  readonly id: CategoryId;
  readonly name: string;
  readonly now: Timestamp;
}

export const FALLBACK_CATEGORY_ID = asCategoryId('cat-other');

export function createCategory(input: NewCategory): Category {
  return Object.freeze({
    id: input.id,
    name: requireName(input.name, TEXT_LIMITS.name, 'Category name'),
    archived: false,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function renameCategory(category: Category, name: string, now: Timestamp): Category {
  return Object.freeze({ ...category, name: requireName(name, TEXT_LIMITS.name, 'Category name'), updatedAt: now });
}

export function setCategoryArchived(category: Category, archived: boolean, now: Timestamp): Category {
  return category.archived === archived ? category : Object.freeze({ ...category, archived, updatedAt: now });
}

/** Case- and accent-insensitive key used to prevent duplicate names ("Comida" vs "comida"). */
export function categoryNameKey(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase(getCurrentLocale());
}

/**
 * Initial categories, created once when the database is first created.
 * Stable ids (not random) so that seeds are idempotent and future merchant
 * rules / backups can refer to them. Names are Spanish (UI language) and the
 * user can rename them freely; nothing depends on the names.
 */
export const DEFAULT_CATEGORIES: readonly { readonly id: CategoryId; readonly name: string }[] = [
  { id: asCategoryId('cat-housing'), name: 'Vivienda' },
  { id: asCategoryId('cat-food'), name: 'Comida' },
  { id: asCategoryId('cat-transport'), name: 'Transporte' },
  { id: asCategoryId('cat-health'), name: 'Salud' },
  { id: asCategoryId('cat-education'), name: 'Educación' },
  { id: asCategoryId('cat-leisure'), name: 'Ocio' },
  { id: asCategoryId('cat-subscriptions'), name: 'Suscripciones' },
  { id: asCategoryId('cat-clothing'), name: 'Ropa' },
  { id: asCategoryId('cat-travel'), name: 'Viajes' },
  { id: asCategoryId('cat-shopping'), name: 'Compras' },
  { id: asCategoryId('cat-taxes'), name: 'Impuestos' },
  { id: asCategoryId('cat-insurance'), name: 'Seguros' },
  { id: asCategoryId('cat-savings'), name: 'Ahorro' },
  { id: FALLBACK_CATEGORY_ID, name: 'Otros' },
];
