import { z } from 'zod';
import { isCurrencyCode } from '../../domain/money/currency.ts';
import { isIsoDate } from '../../domain/shared/dates.ts';
import { TEXT_LIMITS } from '../../domain/shared/text.ts';
import { ApplicationError } from './errors.ts';

/**
 * Zod schemas for data crossing into the application layer (UI forms, the
 * future agent tools, restored backups). The domain re-checks its own
 * invariants; these schemas turn untyped input into typed commands with
 * field-level error messages.
 */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Identificador no válido');
export const isoDateSchema = z.string().refine(isIsoDate, 'Fecha no válida (YYYY-MM-DD)');
export const currencySchema = z.string().refine(isCurrencyCode, 'Moneda no soportada');

export const moneySchema = z.object({
  amountMinor: z.number().int('El importe debe estar en céntimos enteros'),
  currency: currencySchema,
});

export const nameSchema = z.string().max(TEXT_LIMITS.name);
export const descriptionSchema = z.string().max(TEXT_LIMITS.description);
export const merchantSchema = z.string().max(TEXT_LIMITS.merchant);
export const notesSchema = z.string().max(TEXT_LIMITS.notes);

export const recurrenceSchema = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('WEEKLY'), dayOfWeek: z.number().int().min(1).max(7) }),
  z.object({ frequency: z.literal('MONTHLY'), dayOfMonth: z.number().int().min(1).max(31) }),
  z.object({
    frequency: z.literal('YEARLY'),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
]);

export const scopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SHARED') }),
  z.object({ type: z.literal('INDIVIDUAL'), ownerId: idSchema }),
]);

/** Parses `input` or throws ApplicationError('VALIDATION') with per-field issues. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
    code: i.code,
  }));
  throw new ApplicationError('VALIDATION', 'Los datos introducidos no son válidos.', issues, { reason: 'INVALID_INPUT' });
}
