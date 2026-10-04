import { categoryNameKey } from '../domain/category/category.ts';
import { DEFAULT_CURRENCY } from '../domain/money/currency.ts';
import { type Money, currencyMarkers, parseMoney } from '../domain/money/money.ts';
import { DomainError } from '../domain/shared/errors.ts';
import type {
  ExpenseDraft,
  IncomeDraft,
  Intent,
  ParseResult,
  ParserContext,
  Slot,
} from './contracts.ts';
import { esESGrammar } from './grammar/es-ES.ts';

type Command = 'expense' | 'income';

interface AmountPrefix {
  readonly amountText: string;
  readonly amount: Money;
  readonly remainder: string;
}

interface CategoryPrefix {
  readonly id: string;
  readonly consumedWords: number;
}

const slot = <T>(value: T, source: Slot<T>['source']): Slot<T> => ({ value, confidence: 1, source });

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-ES');
}

function splitCommand(text: string): { readonly command: Command; readonly remainder: string } | undefined {
  const trimmed = text.trim();
  const [first = '', ...rest] = trimmed.split(/\s+/u);
  const keyword = fold(first);
  const command: Command | undefined =
    keyword === fold(esESGrammar.expense) ? 'expense' : keyword === fold(esESGrammar.income) ? 'income' : undefined;
  if (!command) return undefined;
  return { command, remainder: rest.join(' ') };
}

function tryParseMoney(text: string): Money | undefined {
  try {
    return parseMoney(text, DEFAULT_CURRENCY);
  } catch (error) {
    if (error instanceof DomainError && (error.code === 'INVALID_AMOUNT' || error.code === 'AMOUNT_OVERFLOW')) {
      return undefined;
    }
    throw error;
  }
}

/** Reads a numeric token and at most one supported currency marker on either side. */
function readAmountPrefix(text: string): AmountPrefix | undefined {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const first = words[0];
  if (!first) return undefined;

  let amountText = first;
  let amount = tryParseMoney(amountText);
  let consumedWords = 1;

  // A separated prefix marker (for example, "€ 42" or "USD 42") is not
  // a valid amount by itself, so include the following numeric token.
  if (!amount) {
    if (currencyMarkers(first).length === 0 || !words[1]) return undefined;
    amountText = `${first} ${words[1]}`;
    amount = tryParseMoney(amountText);
    if (!amount) return undefined;
    consumedWords = 2;
  }

  // A separated suffix marker (for example, "42 euros") belongs to the
  // amount only when the complete candidate still parses as money.
  const suffixMarker = words[consumedWords];
  if (suffixMarker && currencyMarkers(suffixMarker).length > 0) {
    const candidate = `${amountText} ${suffixMarker}`;
    const withSuffix = tryParseMoney(candidate);
    if (withSuffix) {
      amountText = candidate;
      amount = withSuffix;
      consumedWords += 1;
    }
  }

  return {
    amountText,
    amount,
    remainder: words.slice(consumedWords).join(' '),
  };
}

function unrecognized(text: string): ParseResult {
  return { status: 'UNRECOGNIZED', text };
}

function findCategoryPrefix(
  remainder: string,
  categories: ParserContext['categories'],
): CategoryPrefix | undefined {
  const words = remainder.trim().split(/\s+/u).filter(Boolean);
  const matches = categories.flatMap((category) => {
    const categoryWords = category.name.trim().split(/\s+/u).filter(Boolean);
    const matchesPrefix = categoryWords.length > 0 && categoryWords.every(
      (word, index) => words[index] !== undefined && categoryNameKey(words[index] ?? '') === categoryNameKey(word),
    );
    return matchesPrefix ? [{ id: category.id, consumedWords: categoryWords.length, length: categoryNameKey(category.name).length }] : [];
  });
  matches.sort((a, b) => b.consumedWords - a.consumedWords || b.length - a.length);
  const best = matches[0];
  return best ? { id: best.id, consumedWords: best.consumedWords } : undefined;
}

function expenseDraft(
  amount: Money,
  today: ParserContext['today'],
  memberId: string,
  remainder: string,
  categoryId?: string,
): ExpenseDraft {
  return {
    amountMinor: slot(amount.amountMinor, 'USER_TEXT'),
    currency: slot(amount.currency, 'CONTEXT'),
    date: slot(today, 'CONTEXT'),
    ...(categoryId && { categoryId: slot(categoryId, 'USER_TEXT') }),
    ...(remainder && { merchant: slot(remainder, 'USER_TEXT') }),
    expenseType: slot('VARIABLE', 'CONTEXT'),
    scope: slot({ type: 'INDIVIDUAL', ownerId: memberId }, 'CONTEXT'),
    paidBy: slot(memberId, 'CONTEXT'),
  };
}

function incomeDraft(
  amount: Money,
  today: ParserContext['today'],
  memberId: string,
  description: string,
): IncomeDraft {
  return {
    amountMinor: slot(amount.amountMinor, 'USER_TEXT'),
    currency: slot(amount.currency, 'CONTEXT'),
    date: slot(today, 'CONTEXT'),
    memberId: slot(memberId, 'CONTEXT'),
    ...(description && { description: slot(description, 'USER_TEXT') }),
  };
}

/** Parses the fixed Spanish G1 grammar. It never accesses UI, application services, or storage. */
export async function parse(text: string, context: ParserContext): Promise<ParseResult> {
  const command = splitCommand(text);
  if (!command || !context.currentMemberId) return unrecognized(text);

  const parsedPrefix = readAmountPrefix(command.remainder);
  if (!parsedPrefix || parsedPrefix.amount.amountMinor <= 0) return unrecognized(text);
  if (currencyMarkers(parsedPrefix.amountText).some((currency) => currency !== DEFAULT_CURRENCY)) {
    return unrecognized(text);
  }

  if (command.command === 'income') {
    return {
      status: 'COMPLETE',
      intent: {
        kind: 'CREATE_INCOME',
        draft: incomeDraft(parsedPrefix.amount, context.today, context.currentMemberId, parsedPrefix.remainder),
      },
    };
  }

  const category = findCategoryPrefix(parsedPrefix.remainder, context.categories);
  const remainderWords = parsedPrefix.remainder.trim().split(/\s+/u).filter(Boolean);
  const merchant = category
    ? remainderWords.slice(category.consumedWords).join(' ')
    : parsedPrefix.remainder;
  const draft = expenseDraft(parsedPrefix.amount, context.today, context.currentMemberId, merchant, category?.id);
  const intent: Intent = { kind: 'CREATE_EXPENSE', draft };

  if (!category) {
    return {
      status: 'NEEDS_CLARIFICATION',
      intent,
      questions: [{ field: 'category', options: context.categories.map(({ id, name }) => ({ label: name, value: id })) }],
    };
  }

  return { status: 'COMPLETE', intent };
}

/** Completes a pending expense-category clarification with an explicit button choice. */
export function selectExpenseCategory(
  intent: Extract<Intent, { readonly kind: 'CREATE_EXPENSE' }>,
  categoryId: string,
): Extract<Intent, { readonly kind: 'CREATE_EXPENSE' }> {
  return {
    ...intent,
    draft: { ...intent.draft, categoryId: slot(categoryId, 'USER_SELECTION') },
  };
}
