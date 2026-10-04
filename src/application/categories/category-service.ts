import { z } from 'zod';
import {
  type Category,
  FALLBACK_CATEGORY_ID,
  categoryNameKey,
  createCategory,
  renameCategory,
  setCategoryArchived,
} from '../../domain/category/category.ts';
import { toTimestamp } from '../../domain/shared/dates.ts';
import { type CategoryId, asCategoryId } from '../../domain/shared/ids.ts';
import type { AppContext } from '../shared/context.ts';
import { ApplicationError, notFound } from '../shared/errors.ts';
import { getCurrentLocale } from '../../domain/shared/locale.ts';
import { idSchema, nameSchema, parseInput } from '../shared/schemas.ts';

const createSchema = z.object({ name: nameSchema });
const renameSchema = z.object({ id: idSchema, name: nameSchema });
const archiveSchema = z.object({ id: idSchema, archived: z.boolean() });

const byName = (a: Category, b: Category): number => a.name.localeCompare(b.name, getCurrentLocale());

export class CategoryService {
  constructor(private readonly ctx: AppContext) {}

  async list(options: { includeArchived?: boolean } = {}): Promise<Category[]> {
    const all = await this.ctx.categories.getAll();
    return all.filter((c) => options.includeArchived || !c.archived).sort(byName);
  }

  async create(input: { name: string }): Promise<Category> {
    const { name } = parseInput(createSchema, input);
    return this.ctx.tx.run(async () => {
      const category = createCategory({
        id: asCategoryId(this.ctx.newId()),
        name,
        now: toTimestamp(this.ctx.clock.now()),
      });
      await this.assertUniqueName(category.name, null);
      await this.ctx.categories.save(category);
      return category;
    });
  }

  async rename(input: { id: string; name: string }): Promise<Category> {
    const { id, name } = parseInput(renameSchema, input);
    return this.ctx.tx.run(async () => {
      const category = await this.require(asCategoryId(id));
      const updated = renameCategory(category, name, toTimestamp(this.ctx.clock.now()));
      await this.assertUniqueName(updated.name, category.id);
      await this.ctx.categories.save(updated);
      return updated;
    });
  }

  async setArchived(input: { id: string; archived: boolean }): Promise<Category> {
    const { id, archived } = parseInput(archiveSchema, input);
    return this.ctx.tx.run(async () => {
      const category = await this.require(asCategoryId(id));
      if (category.id === FALLBACK_CATEGORY_ID && archived) {
        throw new ApplicationError('CONFLICT', `La categoría "${category.name}" debe permanecer activa.`, [], {
          reason: 'CATEGORY_MUST_STAY_ACTIVE',
          params: { name: category.name },
        });
      }
      const updated = setCategoryArchived(category, archived, toTimestamp(this.ctx.clock.now()));
      if (updated !== category) await this.ctx.categories.save(updated);
      return updated;
    });
  }

  /** Only unused categories can be deleted; used ones are archived instead. */
  async delete(rawId: string): Promise<Category> {
    const id = asCategoryId(parseInput(idSchema, rawId));
    return this.ctx.tx.run(async () => {
      const category = await this.require(id);
      if (category.id === FALLBACK_CATEGORY_ID) {
        throw new ApplicationError('CONFLICT', `La categoría "${category.name}" no se puede borrar.`, [], {
          reason: 'CATEGORY_NOT_DELETABLE',
          params: { name: category.name },
        });
      }
      const used = await this.ctx.expenses.countByCategory(id);
      if (used > 0) {
        throw new ApplicationError(
          'REFERENCE_IN_USE',
          `La categoría "${category.name}" tiene ${used} gastos. Archívala en lugar de eliminarla.`,
          [],
          { reason: 'CATEGORY_IN_USE', params: { name: category.name, count: used } },
        );
      }
      await this.ctx.categories.delete(id);
      return category;
    });
  }

  private async assertUniqueName(name: string, exceptId: CategoryId | null): Promise<void> {
    const key = categoryNameKey(name);
    const clash = (await this.ctx.categories.getAll()).find((c) => c.id !== exceptId && categoryNameKey(c.name) === key);
    if (clash) {
      throw new ApplicationError('CONFLICT', `Ya existe la categoría "${clash.name}".`, [
        { path: 'name', message: 'Nombre duplicado' },
      ], { reason: 'CATEGORY_DUPLICATE', params: { name: clash.name } });
    }
  }

  private async require(id: CategoryId): Promise<Category> {
    const category = await this.ctx.categories.getById(id);
    if (!category) throw notFound('Category', id);
    return category;
  }
}
