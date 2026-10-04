// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useData } from './common.tsx';

afterEach(cleanup);

function deferred(): { promise: Promise<string>; resolve: (value: string) => void } {
  let resolve: (value: string) => void = () => undefined;
  const promise = new Promise<string>((r) => (resolve = r));
  return { promise, resolve };
}

it('useData ignores a slow response that arrives after a newer one (fast month switching)', async () => {
  const october = deferred();
  const november = deferred();
  const { result, rerender } = renderHook(({ load }) => useData(load), {
    initialProps: { load: () => october.promise },
  });
  rerender({ load: () => november.promise });

  await act(async () => november.resolve('noviembre'));
  await act(async () => october.resolve('octubre'));
  expect(result.current.data).toBe('noviembre');
});
