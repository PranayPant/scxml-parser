/**
 * Gate for enabling ELK's layered-graph wrapping strategy. ELK's 'layered'
 * algorithm assigns one node per layer for a mostly-linear chain, so without
 * wrapping, a long sequence of states stacks into a single tall column no
 * matter what aspectRatio is requested. Wrapping folds long chains into
 * multiple rows/columns instead — but for short chains it's unnecessary, so
 * only enable it once a level's node count passes this threshold.
 */
export const DEFAULT_WRAP_THRESHOLD = 8;

export function shouldWrapLevel(
  nodeCount: number,
  threshold: number = DEFAULT_WRAP_THRESHOLD
): boolean {
  return nodeCount > threshold;
}
