/**
 * Generates "<prefix>_N", picking the first N not already present.
 * Callers building multiple new ids in one command must add each
 * generated id to `existingIds` themselves before generating the next.
 */
export function generateUniqueId(
  prefix: string,
  existingIds: Iterable<string>
): string {
  const taken = new Set(existingIds);
  let counter = 1;
  let candidate = `${prefix}_${counter}`;
  while (taken.has(candidate)) {
    counter++;
    candidate = `${prefix}_${counter}`;
  }
  return candidate;
}
