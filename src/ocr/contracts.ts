/**
 * OCR contracts (Phase 0: types only — implementation in Phase 6).
 * See docs/ocr.md.
 *
 *   Receipt blob → ImagePreprocessor → OcrEngine → raw text
 *               → ReceiptParser → ParsedReceipt → user confirms → Expense
 *
 * Nothing here creates an expense. The UI always shows ParsedReceipt for
 * confirmation; low-confidence fields are highlighted, never auto-accepted.
 */
import type { CurrencyCode } from '../domain/money/currency.ts';
import type { IsoDate } from '../domain/shared/dates.ts';

export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

export interface OcrInput {
  readonly data: Blob;
  readonly mimeType: ReceiptMimeType;
  /** BCP-47 hints, e.g. ['es', 'en']. */
  readonly languages?: readonly string[];
}

export interface OcrLine {
  readonly text: string;
  readonly confidence: number;
}

export interface OcrResult {
  readonly text: string;
  readonly lines: readonly OcrLine[];
  /** Overall confidence 0..1 as reported by the engine. */
  readonly confidence: number;
  readonly engineId: string;
  readonly durationMs: number;
}

export interface OcrEngine {
  readonly id: string;
  /** Must be true for any engine enabled by default (privacy, docs/decisions.md). */
  readonly runsLocally: boolean;
  extractText(
    input: OcrInput,
    options?: { readonly signal?: AbortSignal; readonly onProgress?: (fraction: number) => void },
  ): Promise<OcrResult>;
}

export interface ImagePreprocessor {
  /** Resize, grayscale, deskew, PDF page → image… Returns input for the engine. */
  prepare(input: OcrInput): Promise<OcrInput>;
}

export interface Extracted<T> {
  readonly value: T;
  /** 0..1 */
  readonly confidence: number;
}

export interface ParsedReceipt {
  readonly merchant: Extracted<string> | null;
  /** Integer minor units. */
  readonly amount: Extracted<number> | null;
  readonly currency: Extracted<CurrencyCode> | null;
  readonly date: Extracted<IsoDate> | null;
  readonly categoryId: Extracted<string> | null;
  readonly rawText: string;
}

export interface ReceiptParser {
  parse(rawText: string, context: { readonly defaultCurrency: CurrencyCode; readonly today: IsoDate }): ParsedReceipt;
}
