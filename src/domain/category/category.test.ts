import { describe, expect, it } from 'vitest';
import { FOOD, T0, T1 } from '../../test/fixtures.ts';
import { DEFAULT_CATEGORIES, categoryNameKey, createCategory, renameCategory, setCategoryArchived } from './category.ts';

describe('Category', () => {
  it('creates, renames and archives', () => {
    const c = createCategory({ id: FOOD, name: 'Comida', now: T0 });
    expect(c.archived).toBe(false);
    expect(renameCategory(c, 'Supermercado', T1).name).toBe('Supermercado');
    expect(setCategoryArchived(c, true, T1).archived).toBe(true);
  });

  it('compares names ignoring case and accents', () => {
    expect(categoryNameKey('Educación')).toBe(categoryNameKey(' educacion '));
  });

  it('ships the 14 initial categories with unique ids and names', () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(14);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size).toBe(14);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => categoryNameKey(c.name))).size).toBe(14);
  });
});
