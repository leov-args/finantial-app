/** Source of new unique ids. Injected so tests are deterministic. */
export type IdGenerator = () => string;

export const randomIdGenerator: IdGenerator = () => crypto.randomUUID();

export function sequentialIdGenerator(prefix = 'id'): IdGenerator {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}
