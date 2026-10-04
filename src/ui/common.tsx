import { type AriaAttributes, type PointerEvent as ReactPointerEvent, type ReactElement, type SyntheticEvent, cloneElement, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { animate } from 'motion/mini';
import { spring } from 'motion';
import { type BasisPoints, type Money, isNegative, parseMoney, toMajorString } from '../domain/money/money.ts';
import { DEFAULT_CURRENCY } from '../domain/money/currency.ts';
import type { MemberId } from '../domain/shared/ids.ts';
import type { Member } from '../domain/member/member.ts';
import type { IsoDate, YearMonth } from '../domain/shared/dates.ts';
import { FORM, toErrors } from './errors.ts';
import { getLocale, t } from './i18n/index.ts';

// Bumped by any `reload()`: every mounted view re-reads, so a write in one place
// (a view, the capture bar) shows up everywhere without remounting forms.
let dataRevision = 0;
const dataListeners = new Set<() => void>();
function subscribeData(listener: () => void) {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}
function bumpData() {
  dataRevision += 1;
  dataListeners.forEach((listener) => listener());
}

/**
 * Runs `load` (memoise it with useCallback) and re-runs it after any `reload()`
 * in the app, since every reload follows a write. Keeps the previous data while
 * reloading, so lists don't flicker.
 */
export function useData<T>(load: () => Promise<T>): { data?: T; error?: string; reload: () => void } {
  const [result, setResult] = useState<{ data?: T; error?: string }>({});
  const revision = useSyncExternalStore(subscribeData, () => dataRevision);
  useEffect(() => {
    let live = true;
    load().then(
      (data) => {
        if (live) setResult({ data });
      },
      (e: unknown) => {
        if (live) setResult({ error: toErrors(e)[FORM] });
      },
    );
    return () => {
      live = false;
    };
  }, [load, revision]);
  return { ...result, reload: bumpData };
}

/** Label + control + the error for `name` from `errors` (see toErrors), linked to the control for screen readers. */
export function Field({
  label,
  name,
  errors,
  children,
}: {
  label: string;
  name: string;
  errors: Record<string, string>;
  children: ReactElement<AriaAttributes>;
}) {
  const error = errors[name];
  const errorId = useId();
  return (
    <div className="field">
      <label>
        <span className="field__label">{label}</span>
        {error ? cloneElement(children, { 'aria-invalid': true, 'aria-describedby': errorId }) : children}
      </label>
      {error && (
        <p id={errorId} className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ errors }: { errors: Record<string, string> }) {
  return errors[FORM] ? (
    <p className="error" role="alert">
      {errors[FORM]}
    </p>
  ) : null;
}

/**
 * Delete with "Deshacer" (S4). Failures (already deleted, a reference gone
 * before undo) are reported in `errors` instead of being lost; a failed undo
 * keeps the notice so the user can see what was not restored.
 */
export function useDeleteWithUndo<T>(
  remove: (item: T) => Promise<T>,
  restore: (snapshot: T) => Promise<unknown>,
  reload: () => void,
) {
  const [deleted, setDeleted] = useState<T | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function attempt(action: () => Promise<void>) {
    try {
      await action();
      setErrors({});
    } catch (e) {
      setErrors(toErrors(e));
    }
    reload();
  }
  return {
    deleted,
    errors,
    remove: (item: T) => attempt(async () => setDeleted(await remove(item))),
    undo: () =>
      attempt(async () => {
        if (!deleted) return;
        await restore(deleted);
        setDeleted(null);
      }),
  };
}

/** "Eliminado · Deshacer" notice after a delete (S4). */
export function UndoNotice({ message, onUndo }: { message: string | null; onUndo: () => void }) {
  return (
    <div role="status" className="undo">
      {message && (
        <>
          <span>{message}</span>
          <button type="button" onClick={onUndo}>
            {t('common.restore')}
          </button>
        </>
      )}
    </div>
  );
}

// Apple springs as physics (motion/mini ignores velocity on duration-based springs).
// Settle: damping ratio 1, response 0.35 s. Flick: ratio 0.8, response 0.3 s, only after a drag.
const SETTLE = { type: spring, stiffness: 322, damping: 36, mass: 1 };
const FLICK = { type: spring, stiffness: 439, damping: 34, mass: 1 };
const FADE = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;

const WIDE = '(min-width: 900px)';
const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;
const isBottomSheet = () => !matches(WIDE);
const subscribeWide = (onChange: () => void) => {
  if (typeof matchMedia !== 'function') return () => undefined;
  const query = matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
/** True from 900px, the desktop layout (side rail, two columns, side-panel sheets). */
export const useWide = (): boolean => useSyncExternalStore(subscribeWide, () => matches(WIDE));
/** Scroll-like projection of where a flick would come to rest (Apple, «Designing Fluid Interfaces»). */
const project = (velocity: number) => ((velocity / 1000) * 0.998) / (1 - 0.998);
/** Progressive resistance when the sheet is pulled past its open position. */
const rubberband = (overshoot: number, size: number) => (overshoot * size * 0.55) / (size + 0.55 * Math.abs(overshoot));
const translateY = (element: HTMLElement) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;

/**
 * A modal `<dialog>` that enters from its edge (bottom sheet on mobile, side
 * panel from 900px) and leaves the same way. `close(after)` plays the exit
 * before running `after` (default `onClosed`), so callers unmount it then.
 * On mobile `grabber` drags it down: 1:1 tracking, the flick is projected and
 * its velocity handed to the spring. Without WAAPI (tests) everything is instant.
 */
export function useSheet(onClosed: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const motion = useRef<ReturnType<typeof animate> | null>(null);
  const closing = useRef(false);
  const drag = useRef<{ id: number; startY: number; from: number; height: number; samples: { y: number; t: number }[] } | null>(null);

  const play = (keyframes: Record<string, string[]>, options: object) => {
    const element = ref.current;
    if (!element || typeof element.animate !== 'function') return Promise.resolve();
    motion.current?.stop();
    motion.current = animate(element, keyframes, options);
    return motion.current.finished;
  };
  const hidden = () => (isBottomSheet() ? 'translateY(100%)' : 'translateX(100%)');
  const reduced = () => matches('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    ref.current?.showModal();
    void (reduced() ? play({ opacity: ['0', '1'] }, FADE) : play({ transform: [hidden(), 'none'] }, SETTLE));
    return () => motion.current?.stop(); // open once, on mount
  }, []);

  function close(after: () => void = onClosed, velocity = 0) {
    const element = ref.current;
    if (!element || closing.current) return;
    closing.current = true;
    element.dataset['closing'] = '';
    element.inert = true; // no second submit while it leaves
    let exit: Promise<unknown>;
    if (reduced()) exit = play({ opacity: ['1', '0'] }, FADE);
    else if (velocity) {
      // From where the finger left it, at the finger's speed (spring velocity is on a 0–100 scale).
      const from = translateY(element);
      const to = element.offsetHeight;
      exit = play({ transform: [`translateY(${from}px)`, `translateY(${to}px)`] }, { ...FLICK, velocity: (velocity * 100) / Math.max(1, to - from) });
    } else exit = play({ transform: [getComputedStyle(element).transform, hidden()] }, SETTLE);
    // Even if the animation is cancelled, the sheet must still close and hand back.
    const done = () => {
      element.close();
      after();
    };
    void exit.then(done, done);
  }

  function onPointerDown(event: ReactPointerEvent) {
    const element = ref.current;
    if (!element || drag.current || closing.current || !isBottomSheet()) return;
    motion.current?.stop(); // grab it mid-flight, from where it is on screen
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, startY: event.clientY, from: translateY(element), height: element.offsetHeight, samples: [{ y: event.clientY, t: event.timeStamp }] };
  }
  function onPointerMove(event: ReactPointerEvent) {
    const state = drag.current;
    const element = ref.current;
    if (!state || !element || event.pointerId !== state.id) return;
    const offset = state.from + event.clientY - state.startY;
    element.style.transform = `translateY(${offset < 0 ? rubberband(offset, state.height) : offset}px)`;
    state.samples = [...state.samples.filter((sample) => event.timeStamp - sample.t < 100), { y: event.clientY, t: event.timeStamp }];
  }
  function onPointerUp(event: ReactPointerEvent) {
    const state = drag.current;
    const element = ref.current;
    if (!state || !element || event.pointerId !== state.id) return;
    drag.current = null;
    const first = state.samples[0];
    const elapsed = first ? event.timeStamp - first.t : 0;
    // A cancelled pointer carries no gesture to project: it settles by position only.
    const velocity = first && elapsed > 0 && event.type !== 'pointercancel' ? ((event.clientY - first.y) / elapsed) * 1000 : 0;
    const offset = translateY(element);
    if (offset + project(velocity) > state.height / 2) return close(onClosed, Math.max(velocity, 1));
    const back = { ...FLICK, velocity: offset ? (velocity * 100) / -offset : 0 };
    void play({ transform: [`translateY(${offset}px)`, 'translateY(0px)'] }, back);
  }

  return {
    close,
    dialogProps: {
      ref,
      // Esc plays the exit too; if the browser forces the close anyway, still tell the owner.
      onCancel: (event: SyntheticEvent) => {
        event.preventDefault();
        close();
      },
      onClose: () => {
        if (!closing.current) onClosed();
      },
    },
    grabberProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, 'aria-hidden': true },
  };
}

/** Amount as the user would type it back ("42,35"). */
export const amountText = (amount: Money): string => toMajorString(amount).replace('.', ',');

/** Reads a FormData entry as a trimmed string ('' when absent). */
export const text = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();

/** '' clears the income; `undefined` means the text is not a valid non-negative amount. */
export function readIncome(input: string): Money | null | undefined {
  if (!input.trim()) return null;
  try {
    const amount = parseMoney(input, DEFAULT_CURRENCY);
    return isNegative(amount) ? undefined : amount;
  } catch {
    return undefined;
  }
}

const ME_STORAGE_KEY = 'family-finance.me';
const ME_CHANGED_EVENT = 'family-finance:me-changed';

/** Device-only preference; it is deliberately not part of IndexedDB or backups. */
export function useMe(members: readonly Member[]): [MemberId | null, (id: MemberId | null) => void] {
  const [me, setMeState] = useState<MemberId | null>(() => {
    try {
      return localStorage.getItem(ME_STORAGE_KEY) as MemberId | null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const onMeChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ readonly id: MemberId | null } | undefined>).detail;
      if (detail) setMeState(detail.id);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ME_STORAGE_KEY || event.key === null) {
        setMeState(event.newValue as MemberId | null);
      }
    };
    window.addEventListener(ME_CHANGED_EVENT, onMeChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(ME_CHANGED_EVENT, onMeChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  // A single active member is always "me"; a stored id only counts while that member is active.
  const active = members.filter((member) => member.active);
  const selectedMe = active.length === 1 ? (active[0]?.id ?? null) : active.some((member) => member.id === me) ? me : null;
  const setMe = (id: MemberId | null) => {
    setMeState(id);
    try {
      if (id) localStorage.setItem(ME_STORAGE_KEY, id);
      else localStorage.removeItem(ME_STORAGE_KEY);
    } catch {
      // A private browsing policy may deny localStorage; the current session still works.
    }
    window.dispatchEvent(new CustomEvent(ME_CHANGED_EVENT, { detail: { id } }));
  };
  return [selectedMe, setMe];
}

// Calendar strings are formatted in UTC so the user's timezone can't shift the day.
const utc = (isoDate: string) => {
  const [y = 0, m = 1, d = 1] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const monthLabel = (month: YearMonth): string => new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(month));
export const shortMonthLabel = (month: YearMonth): string => new Intl.DateTimeFormat(getLocale(), { month: 'short', timeZone: 'UTC' }).format(utc(month));
export const dayLabel = (date: IsoDate): string => new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(date));
/** Display-only percentage from basis points (7273 → "72,7 %"). */
export const percent = (basisPoints: BasisPoints): string => new Intl.NumberFormat(getLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(basisPoints / 10_000);

