# OCR de recibos

Estado: **contratos definidos** (`src/ocr/contracts.ts`). Implementación en la fase 6.

## Pipeline

```text
Receipt (blob local)
   ↓  ImagePreprocessor.prepare()     redimensionar, escala de grises, PDF → imagen
   ↓  OcrEngine.extractText()         texto + líneas + confianza
   ↓  ReceiptParser.parse()           comercio, importe, fecha, moneda, categoría sugerida (con confianza)
   ↓  UI de confirmación              el usuario revisa y corrige
   ↓  ExpenseService.create()
Expense
```

**Nunca** se crea un gasto a partir de OCR sin confirmación explícita.

## Contratos

```ts
interface OcrEngine {
  readonly id: string;
  readonly runsLocally: boolean;
  extractText(input: OcrInput, options?: { signal?: AbortSignal; onProgress?: (f: number) => void }): Promise<OcrResult>;
}
```

- `OcrInput`: blob + `mimeType` (`image/jpeg | image/png | image/webp | application/pdf`) + idiomas.
- `ParsedReceipt`: cada campo es `Extracted<T> { value, confidence }` o `null`. El importe va en céntimos (se obtiene con `parseMoney`, sin floats).

## Criterios para elegir motor (fase 6)

1. Se ejecuta **en el dispositivo** (WASM/Web Worker). Ningún motor remoto por defecto.
2. Carga diferida (lazy): no aumenta el bundle inicial; el modelo de idioma se descarga solo cuando se usa OCR por primera vez y queda en caché para uso offline.
3. Coste de memoria aceptable en móviles modestos.

Candidato principal: Tesseract.js (WASM, local). Se evaluará tamaño y precisión con tickets españoles antes de añadirlo (`decisions.md`). El resto de la app no depende del motor: basta otra implementación de `OcrEngine`.

## Seguridad

El texto OCR es texto no confiable: se guarda y muestra como texto plano, nunca como HTML.
