/**
 * Agent contracts (Phase 0: types only — implementation starts in Phase 4).
 * See docs/agent.md.
 *
 * Pipeline:  text → IntentParser → Intent → AgentTool → application service
 *                                                     → domain → IndexedDB
 *
 * Invariants:
 *  - The agent never touches IndexedDB; tools call application services.
 *  - Every number shown to the user comes from a tool result, never from a
 *    model's own arithmetic.
 *  - A parser (rules today, LLM tomorrow) only proposes intents. Missing or
 *    ambiguous fields become clarifications, never silent defaults.
 */
import type { ExpenseType } from '../domain/expense/expense.ts';
import type { CurrencyCode } from '../domain/money/currency.ts';
import type { IsoDate, YearMonth } from '../domain/shared/dates.ts';

/** A value the parser extracted, with where it came from and how sure it is (0..1). */
export interface Slot<T> {
  readonly value: T;
  readonly confidence: number;
  readonly source: 'USER_TEXT' | 'USER_SELECTION' | 'MERCHANT_RULE' | 'DEFAULT_VISIBLE' | 'CONTEXT';
}

export interface ExpenseDraft {
  readonly amountMinor?: Slot<number>;
  readonly currency?: Slot<CurrencyCode>;
  readonly merchant?: Slot<string>;
  readonly date?: Slot<IsoDate>;
  readonly categoryId?: Slot<string>;
  readonly expenseType?: Slot<ExpenseType>;
  readonly scope?: Slot<{ type: 'SHARED' } | { type: 'INDIVIDUAL'; ownerId: string }>;
  readonly paidBy?: Slot<string>;
}

export interface IncomeDraft {
  readonly amountMinor?: Slot<number>;
  readonly currency?: Slot<CurrencyCode>;
  readonly date?: Slot<IsoDate>;
  readonly memberId?: Slot<string>;
  readonly description?: Slot<string>;
}

export type Period =
  | { readonly kind: 'MONTH'; readonly month: YearMonth }
  | { readonly kind: 'YEAR'; readonly year: number }
  | { readonly kind: 'RANGE'; readonly from: IsoDate; readonly to: IsoDate };

export type Intent =
  | { readonly kind: 'CREATE_EXPENSE'; readonly draft: ExpenseDraft }
  | { readonly kind: 'CREATE_INCOME'; readonly draft: IncomeDraft }
  | { readonly kind: 'QUERY_SPENDING'; readonly period: Period; readonly who: 'ME' | 'HOUSEHOLD'; readonly categoryHint?: string }
  | { readonly kind: 'QUERY_CONTRIBUTION'; readonly period: Period }
  | { readonly kind: 'QUERY_SAVINGS'; readonly period: Period }
  | { readonly kind: 'QUERY_BUDGET'; readonly period: Period; readonly categoryHint?: string }
  | { readonly kind: 'UNDO' };

export type ClarifiableField = 'amount' | 'category' | 'scope' | 'paidBy' | 'date' | 'expenseType';

export interface Clarification {
  readonly field: ClarifiableField;
  readonly options?: readonly { readonly label: string; readonly value: string }[];
}

export type ParseResult =
  | { readonly status: 'COMPLETE'; readonly intent: Intent }
  | { readonly status: 'NEEDS_CLARIFICATION'; readonly intent: Intent; readonly questions: readonly Clarification[] }
  | { readonly status: 'UNRECOGNIZED'; readonly text: string };

/** What a parser may know besides the text. No financial data beyond names. */
export interface ParserContext {
  readonly today: IsoDate;
  readonly currentMemberId: string | null;
  readonly members: readonly { readonly id: string; readonly name: string }[];
  readonly categories: readonly { readonly id: string; readonly name: string }[];
}

/** Rules-based now; an LLM-backed implementation can replace it later. */
export interface IntentParser {
  parse(text: string, context: ParserContext): Promise<ParseResult>;
}

export interface ToolError {
  readonly code: string;
  readonly message: string;
}

/** Opaque handle to revert a mutation ("Deshacer"). */
export interface UndoAction {
  readonly label: string;
  run(): Promise<void>;
}

export type ToolResult<O> =
  | { readonly ok: true; readonly data: O; readonly undo?: UndoAction }
  | { readonly ok: false; readonly error: ToolError };

/** A typed capability the agent can invoke. Input is validated before `execute`. */
export interface AgentTool<I, O> {
  readonly name: string;
  readonly description: string;
  readonly mutates: boolean;
  execute(input: I): Promise<ToolResult<O>>;
}

/**
 * Optional language model. Never required for any feature.
 * A REMOTE provider may only be used after explicit user opt-in, and its
 * credentials must never be stored in IndexedDB or shipped in the bundle.
 */
export interface LanguageModelProvider {
  readonly id: string;
  readonly locality: 'LOCAL' | 'REMOTE';
  complete(request: {
    readonly system: string;
    readonly messages: readonly { readonly role: 'user' | 'assistant' | 'tool'; readonly content: string }[];
    readonly tools: readonly { readonly name: string; readonly description: string; readonly inputJsonSchema: unknown }[];
    readonly signal?: AbortSignal;
  }): Promise<
    | { readonly type: 'TEXT'; readonly text: string }
    | { readonly type: 'TOOL_CALL'; readonly name: string; readonly input: unknown }
  >;
}
