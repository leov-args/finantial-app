import { describe, expect, it } from 'vitest';
import { asIsoDate } from '../domain/shared/dates.ts';
import type { ParserContext } from './contracts.ts';
import { parse, selectExpenseCategory } from './parser.ts';

const TODAY = asIsoDate('2026-10-02');

const context: ParserContext = {
  today: TODAY,
  currentMemberId: 'member-me',
  members: [
    { id: 'member-me', name: 'Ana' },
    { id: 'member-partner', name: 'Pareja' },
  ],
  categories: [
    { id: 'cat-food', name: 'Comida' },
    { id: 'cat-food-out', name: 'Comida fuera' },
    { id: 'cat-other', name: 'Otros' },
  ],
};

describe('assistant parser G1', () => {
  it('G1 parses a complete expense and keeps the remainder as merchant', async () => {
    const result = await parse('Gasto 12,50 comida mercadona', context);

    expect(result.status).toBe('COMPLETE');
    if (result.status !== 'COMPLETE' || result.intent.kind !== 'CREATE_EXPENSE') {
      throw new Error('Expected a complete expense intent.');
    }
    expect(result.intent.draft.amountMinor).toEqual({ value: 1250, confidence: 1, source: 'USER_TEXT' });
    expect(result.intent.draft.currency).toEqual({ value: 'EUR', confidence: 1, source: 'CONTEXT' });
    expect(result.intent.draft.date).toEqual({ value: TODAY, confidence: 1, source: 'CONTEXT' });
    expect(result.intent.draft.categoryId).toEqual({ value: 'cat-food', confidence: 1, source: 'USER_TEXT' });
    expect(result.intent.draft.merchant).toEqual({ value: 'mercadona', confidence: 1, source: 'USER_TEXT' });
    expect(result.intent.draft.expenseType).toEqual({ value: 'VARIABLE', confidence: 1, source: 'CONTEXT' });
    expect(result.intent.draft.scope).toEqual({
      value: { type: 'INDIVIDUAL', ownerId: 'member-me' },
      confidence: 1,
      source: 'CONTEXT',
    });
    expect(result.intent.draft.paidBy).toEqual({ value: 'member-me', confidence: 1, source: 'CONTEXT' });
  });

  it('G1 asks for a category when only amount is supplied', async () => {
    const result = await parse('gasto 126', context);

    expect(result.status).toBe('NEEDS_CLARIFICATION');
    if (result.status !== 'NEEDS_CLARIFICATION' || result.intent.kind !== 'CREATE_EXPENSE') {
      throw new Error('Expected an expense category clarification.');
    }
    expect(result.intent.draft.amountMinor).toEqual({ value: 12600, confidence: 1, source: 'USER_TEXT' });
    expect(result.intent.draft.categoryId).toBeUndefined();
    expect(result.intent.draft.merchant).toBeUndefined();
    expect(result.questions).toEqual([
      {
        field: 'category',
        options: [
          { label: 'Comida', value: 'cat-food' },
          { label: 'Comida fuera', value: 'cat-food-out' },
          { label: 'Otros', value: 'cat-other' },
        ],
      },
    ]);
  });

  it('G1 treats an explicit unknown category as missing and preserves the whole tail', async () => {
    const result = await parse('gasto 10 electricidad mercadona', context);

    expect(result.status).toBe('NEEDS_CLARIFICATION');
    if (result.status !== 'NEEDS_CLARIFICATION' || result.intent.kind !== 'CREATE_EXPENSE') {
      throw new Error('Expected an expense category clarification.');
    }
    expect(result.intent.draft.merchant).toEqual({
      value: 'electricidad mercadona',
      confidence: 1,
      source: 'USER_TEXT',
    });
  });

  it('G1 chooses the longest exact multiword category prefix', async () => {
    const result = await parse('gasto 4,50 comida fuera restaurante', context);

    expect(result.status).toBe('COMPLETE');
    if (result.status !== 'COMPLETE' || result.intent.kind !== 'CREATE_EXPENSE') {
      throw new Error('Expected a complete expense intent.');
    }
    expect(result.intent.draft.categoryId?.value).toBe('cat-food-out');
    expect(result.intent.draft.merchant?.value).toBe('restaurante');
  });

  it('G1 ignores case and accents in command and category names', async () => {
    const result = await parse('GÁSTO 12,50 CÓMIDA', context);

    expect(result.status).toBe('COMPLETE');
    if (result.status !== 'COMPLETE' || result.intent.kind !== 'CREATE_EXPENSE') {
      throw new Error('Expected a complete expense intent.');
    }
    expect(result.intent.draft.categoryId?.value).toBe('cat-food');
  });

  it('G1 parses an income and preserves its optional description', async () => {
    const result = await parse('INGRESO 1200 bonus de octubre', context);

    expect(result.status).toBe('COMPLETE');
    if (result.status !== 'COMPLETE' || result.intent.kind !== 'CREATE_INCOME') {
      throw new Error('Expected a complete income intent.');
    }
    expect(result.intent.draft.amountMinor).toEqual({ value: 120000, confidence: 1, source: 'USER_TEXT' });
    expect(result.intent.draft.currency).toEqual({ value: 'EUR', confidence: 1, source: 'CONTEXT' });
    expect(result.intent.draft.date).toEqual({ value: TODAY, confidence: 1, source: 'CONTEXT' });
    expect(result.intent.draft.memberId).toEqual({ value: 'member-me', confidence: 1, source: 'CONTEXT' });
    expect(result.intent.draft.description).toEqual({ value: 'bonus de octubre', confidence: 1, source: 'USER_TEXT' });
  });

  it('G1 completes an income without inventing a description', async () => {
    const result = await parse('ingreso 1200', context);

    expect(result.status).toBe('COMPLETE');
    if (result.status !== 'COMPLETE' || result.intent.kind !== 'CREATE_INCOME') {
      throw new Error('Expected a complete income intent.');
    }
    expect(result.intent.draft.description).toBeUndefined();
  });

  it.each([
    'gasto 42,35 € comida',
    'gasto € 42 comida',
    'gasto €42 comida',
    'gasto 42€ comida',
    'gasto euro 42 comida',
    'gasto euros 42 comida',
    'gasto 42 euro comida',
    'gasto 42 euros comida',
    'gasto EUR 42 comida',
    'gasto EUR42 comida',
    'gasto 42 EUR comida',
    'gasto 42EUR comida',
  ])('G1 accepts EUR markers without turning them into merchant text: %s', async (phrase) => {
    const result = await parse(phrase, context);

    expect(result.status).toBe('COMPLETE');
    if (result.status !== 'COMPLETE' || result.intent.kind !== 'CREATE_EXPENSE') {
      throw new Error('Expected a complete expense intent.');
    }
    expect(result.intent.draft.currency?.value).toBe('EUR');
    expect(result.intent.draft.categoryId?.value).toBe('cat-food');
  });

  it.each([
    'gasto USD 42 comida',
    'gasto 42 usd comida',
    'gasto $42 comida',
    'gasto 42$ comida',
    'gasto S/42 comida',
    'gasto 42 PEN comida',
    'gasto 0 comida',
    'gasto -5 comida',
    'gasto 1.234,567 comida',
    'gasto 999999999999999999999999 comida',
    'gasto',
    'hola 42 comida',
  ])('G1 returns UNRECOGNIZED instead of guessing or throwing: %s', async (phrase) => {
    await expect(parse(phrase, context)).resolves.toEqual({ status: 'UNRECOGNIZED', text: phrase });
  });

  it('G1 records a button-selected category as USER_SELECTION', async () => {
    const parsed = await parse('gasto 126', context);
    expect(parsed.status).toBe('NEEDS_CLARIFICATION');
    if (parsed.status !== 'NEEDS_CLARIFICATION' || parsed.intent.kind !== 'CREATE_EXPENSE') {
      throw new Error('Expected an expense category clarification.');
    }

    const selected = selectExpenseCategory(parsed.intent, 'cat-food');

    expect(selected.draft.categoryId).toEqual({ value: 'cat-food', confidence: 1, source: 'USER_SELECTION' });
    expect(selected.draft.amountMinor).toEqual(parsed.intent.draft.amountMinor);
    expect(selected.draft.merchant).toEqual(parsed.intent.draft.merchant);
  });
});
