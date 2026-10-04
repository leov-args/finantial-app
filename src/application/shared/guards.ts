import type { Category } from '../../domain/category/category.ts';
import type { Member } from '../../domain/member/member.ts';
import type { CategoryId, MemberId } from '../../domain/shared/ids.ts';
import type { AppContext } from './context.ts';
import { ApplicationError } from './errors.ts';

/**
 * Referential checks shared by use cases. IndexedDB has no foreign keys, so
 * the application layer is responsible for never writing dangling ids.
 */
export async function requireMember(
  ctx: AppContext,
  id: MemberId,
  field: string,
  { mustBeActive }: { mustBeActive: boolean },
): Promise<Member> {
  const member = await ctx.members.getById(id);
  if (!member) {
    throw new ApplicationError('VALIDATION', 'El miembro indicado no existe.', [{ path: field, message: 'Miembro desconocido' }], {
      reason: 'MEMBER_UNKNOWN',
    });
  }
  if (mustBeActive && !member.active) {
    throw new ApplicationError('VALIDATION', `"${member.name}" está desactivado.`, [{ path: field, message: 'Miembro inactivo' }], {
      reason: 'MEMBER_INACTIVE',
      params: { name: member.name },
    });
  }
  return member;
}

export async function requireCategory(
  ctx: AppContext,
  id: CategoryId,
  field: string,
  { mustBeActive }: { mustBeActive: boolean },
): Promise<Category> {
  const category = await ctx.categories.getById(id);
  if (!category) {
    throw new ApplicationError('VALIDATION', 'La categoría indicada no existe.', [{ path: field, message: 'Categoría desconocida' }], {
      reason: 'CATEGORY_UNKNOWN',
    });
  }
  if (mustBeActive && category.archived) {
    throw new ApplicationError('VALIDATION', `La categoría "${category.name}" está archivada.`, [
      { path: field, message: 'Categoría archivada' },
    ], { reason: 'CATEGORY_ARCHIVED', params: { name: category.name } });
  }
  return category;
}
