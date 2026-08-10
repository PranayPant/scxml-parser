/**
 * AST mutation helpers for the Canvas -> Code direction.
 *
 * In a two-way visual editor the SCXML string is the source of truth, but
 * visual actions (connect an edge, delete a node, rename a state in a
 * property panel) mutate the in-memory AST *before* it is serialized back to
 * text via `serializeSCXML`. These helpers bundle the cascading,
 * consistency-preserving updates (rewriting `transition.target` lists,
 * `<initial>`/`<history>` references, etc.) into single, safe, in-place
 * calls so editors don't hand-walk nested arrays.
 *
 * All functions mutate `doc` in place (returning `void`, or the created node
 * for the factories) and are UI-agnostic — they know nothing about the
 * rendering layer.
 */
import type {
  FinalNode,
  HistoryNode,
  InitialBlock,
  ParallelNode,
  SCXMLDocument,
  StateNode,
  Transition,
} from '../types/ast';
import { parseIdList, walkTransitions } from '../validator/walker';

/** Parent kinds that can hold transitions, for target rewrites. */
type TransitionContainer = StateNode | ParallelNode;

/** Rename any final whose id matches, in place. */
function renameFinals(finals: FinalNode[], oldId: string, newId: string): void {
  for (const f of finals) {
    if (f.id === oldId) {
      f.id = newId;
    }
  }
}

/**
 * Renames a state and cascades the change across the whole document so the
 * AST stays internally consistent: the node's own `id`, every
 * `transition.target` token, `initial` attributes (root and nested), and
 * `<initial>`/`<history>` default-transition targets.
 */
export function renameState(doc: SCXMLDocument, oldId: string, newId: string): void {
  const root = doc.scxml;
  const renameInNode = (node: StateNode | ParallelNode): void => {
    if (node.id === oldId) {
      node.id = newId;
    }
    if ('initial' in node && node.initial && references(node.initial, oldId)) {
      node.initial = replaceTargetToken(node.initial, oldId, newId);
    }
    rewriteTransitions(node.transitions, oldId, newId);
    rewriteInitialBlock(node.initialBlock, oldId, newId);
    for (const h of node.history) {
      rewriteHistory(h, oldId, newId);
    }
  };

  if (root.initial && references(root.initial, oldId)) {
    root.initial = replaceTargetToken(root.initial, oldId, newId);
  }
  walkNodes(doc, renameInNode);

  // <final> nodes are not transition containers, so `walkNodes` deliberately
  // doesn't visit them; rename any matching root-level or nested finals so a
  // final's own id stays consistent with the rewrite above.
  renameFinals(root.finals, oldId, newId);
  walkNodes(doc, (node) => renameFinals(node.finals, oldId, newId));
}

/**
 * Removes a state and prunes dangling references. Outgoing transitions that
 * only pointed at `deletedId` are removed (or reduced to a targetless
 * transition when they carry standalone meaning); `initial` attributes that
 * named `deletedId` are cleared.
 */
export function removeState(doc: SCXMLDocument, stateId: string): void {
  const root = doc.scxml;
  if (root.initial && references(root.initial, stateId)) {
    delete root.initial;
  }
  removeNodeAndPrune(doc, stateId);
}

/**
 * Adds a new state / parallel / final node under `parentId` (or the document
 * root when `parentId` is null or the root id). Fields are defaulted to a
 * well-formed node (empty arrays) and the created node is returned.
 */
export function addState(
  doc: SCXMLDocument,
  parentId: string | null,
  config: Partial<StateNode> & { id: string },
): StateNode {
  const node: StateNode = {
    id: config.id,
    transitions: [],
    states: [],
    parallels: [],
    finals: [],
    history: [],
    invoke: [],
    metadata: [],
    ...(config.type !== undefined && { type: config.type }),
    ...(config.initial !== undefined && { initial: config.initial }),
  };

  if (config.initialBlock) {
    node.initialBlock = config.initialBlock;
  }

  const parent = findNodeById(doc, parentId) ?? doc.scxml;
  // All containers (root, state, parallel) expose a `states` array; a new
  // <state> lands there. (Parallel/final nodes are added via their own
  // fields by callers who construct a ParallelNode/FinalNode.)
  parent.states.push(node);
  return node;
}

/**
 * Constructs a well-formed `Transition` (deterministic id, empty executable,
 * default `type: "external"`), attaches it to the transition list of the
 * source state/parallel, and returns it so the canvas can use its assigned
 * `id` immediately.
 */
export function addTransition(
  doc: SCXMLDocument,
  sourceId: string,
  targetId: string,
  event?: string,
  options?: Partial<Omit<Transition, 'id' | 'target' | 'event'>>,
): Transition {
  const source = findTransitionOwner(doc, sourceId);
  if (!source) {
    throw new Error(`addTransition: source state '${sourceId}' not found`);
  }
  const transition: Transition = {
    event,
    target: targetId,
    type: (options?.type ?? 'external') as 'internal' | 'external',
    executable: options?.executable ?? [],
    metadata: options?.metadata ?? [],
    ...(options?.cond !== undefined && { cond: options.cond }),
  };
  transition.id = deriveTransitionId(doc, sourceId, targetId);
  source.transitions.push(transition);
  return transition;
}

/**
 * Removes a transition by its stable id from wherever it lives (state /
 * parallel `.transitions`, `<initial>` transitions, or a `<history>` default
 * transition).
 */
export function removeTransition(doc: SCXMLDocument, transitionId: string): void {
  walkTransitions(doc, (t, parent) => {
    if (t.id !== transitionId) {
      return;
    }
    if ('transitions' in parent && Array.isArray(parent.transitions)) {
      const idx = parent.transitions.findIndex((x) => x.id === transitionId);
      if (idx !== -1) {
        parent.transitions.splice(idx, 1);
      }
      return;
    }
    if ('transition' in parent && Array.isArray(parent.transition)) {
      parent.transition = parent.transition.filter((x) => x.id !== transitionId);
      return;
    }
    if ('transition' in parent && !Array.isArray(parent.transition)) {
      if (parent.transition?.id === transitionId) {
        delete parent.transition;
      }
    }
  });
}

/**
 * Walks every state-like node (state/parallel/final) including finals and
 * history, invoking `visit` for containers that own transitions (state/parallel).
 */
function walkNodes(doc: SCXMLDocument, visit: (node: StateNode | ParallelNode) => void): void {
  const root = doc.scxml;
  for (const s of root.states) {
    visit(s);
    walkState(s, visit);
  }
  for (const p of root.parallels) {
    visit(p);
    walkParallel(p, visit);
  }
}

function walkState(state: StateNode, visit: (node: StateNode | ParallelNode) => void): void {
  for (const s of state.states) {
    visit(s);
    walkState(s, visit);
  }
  for (const p of state.parallels) {
    visit(p);
    walkParallel(p, visit);
  }
}

function walkParallel(
  parallel: ParallelNode,
  visit: (node: StateNode | ParallelNode) => void,
): void {
  for (const s of parallel.states) {
    visit(s);
    walkState(s, visit);
  }
  for (const p of parallel.parallels) {
    visit(p);
    walkParallel(p, visit);
  }
}

/** Finds a state/parallel container by id for appending children. */
function findNodeById(doc: SCXMLDocument, id: string | null): StateNode | ParallelNode | undefined {
  if (id === null || id === '') {
    return undefined; // caller falls back to doc.scxml
  }
  let found: StateNode | ParallelNode | undefined;
  walkNodes(doc, (node) => {
    if (node.id === id) {
      found = node;
    }
  });
  return found;
}

/** Finds a transition-owning state/parallel by id for appending transitions. */
function findTransitionOwner(doc: SCXMLDocument, id: string): StateNode | ParallelNode | undefined {
  let found: StateNode | ParallelNode | undefined;
  walkNodes(doc, (node) => {
    if (node.id === id) {
      found = node;
    }
  });
  return found;
}

/**
 * Computes a deterministic, collision-free transition id using the same
 * `${source}:${target}` scheme as the parser (with `_1`, `_2`, ... suffixes).
 */
function deriveTransitionId(doc: SCXMLDocument, sourceId: string, targetId: string): string {
  const base = `${sourceId}:${targetId}`;
  let candidate = base;
  let n = 1;
  const taken = new Set<string>();
  walkTransitions(doc, (t) => {
    if (t.id) {
      taken.add(t.id);
    }
  });
  while (taken.has(candidate)) {
    candidate = `${base}_${n}`;
    n += 1;
  }
  return candidate;
}

function rewriteTransitions(transitions: Transition[], oldId: string, newId: string): void {
  for (const t of transitions) {
    if (t.target && references(t.target, oldId)) {
      t.target = replaceTargetToken(t.target, oldId, newId);
    }
  }
}

function rewriteInitialBlock(block: InitialBlock | undefined, oldId: string, newId: string): void {
  if (!block) {
    return;
  }
  for (const t of block.transition ?? []) {
    if (t.target && references(t.target, oldId)) {
      t.target = replaceTargetToken(t.target, oldId, newId);
    }
  }
  for (const nested of block.blocks ?? []) {
    rewriteInitialBlock(nested, oldId, newId);
  }
}

function rewriteHistory(history: HistoryNode, oldId: string, newId: string): void {
  const target = history.transition?.target;
  if (target && references(target, oldId)) {
    history.transition!.target = replaceTargetToken(target, oldId, newId);
  }
}

/** Whether a space-separated id list references the given id. */
function references(list: string, id: string): boolean {
  return parseIdList(list).includes(id);
}

/**
 * Replaces a single id token within a space-separated list, preserving the
 * other tokens.
 */
function replaceTargetToken(list: string, oldId: string, newId: string): string {
  return parseIdList(list)
    .map((part) => (part === oldId ? newId : part))
    .join(' ');
}

/**
 * Removes the state node (by kind) and prunes references to it across every
 * transition container.
 */
function removeNodeAndPrune(doc: SCXMLDocument, stateId: string): void {
  // 1. Remove the node from its parent container.
  walkNodes(doc, (node) => {
    node.states = node.states.filter((s) => s.id !== stateId);
    node.parallels = node.parallels.filter((p) => p.id !== stateId);
    node.finals = node.finals.filter((f) => f.id !== stateId);
    if ('initial' in node && node.initial && references(node.initial, stateId)) {
      node.initial = removeTargetToken(node.initial, stateId);
    }
  });
  doc.scxml.states = doc.scxml.states.filter((s) => s.id !== stateId);
  doc.scxml.parallels = doc.scxml.parallels.filter((p) => p.id !== stateId);
  doc.scxml.finals = doc.scxml.finals.filter((f) => f.id !== stateId);

  // 2. Prune dangling transitions that referenced stateId.
  walkTransitions(doc, (t, parent) => {
    if (!t.target || !references(t.target, stateId)) {
      return;
    }
    const remaining = removeTargetToken(t.target, stateId);
    if (remaining.length > 0) {
      t.target = remaining;
      return;
    }
    // Target list is now empty.
    const hasOwnMeaning =
      (t.event !== undefined && t.event !== '') ||
      (t.cond !== undefined && t.cond !== '') ||
      (t.executable && t.executable.length > 0);
    if (hasOwnMeaning) {
      // Preserve the transition as an internal, targetless event handler.
      delete t.target;
    } else {
      removeTransitionFromParent(t, parent as TransitionContainer);
    }
  });
}

function removeTransitionFromParent(
  t: Transition,
  parent: StateNode | ParallelNode | InitialBlock | HistoryNode,
): void {
  if ('transitions' in parent && Array.isArray(parent.transitions)) {
    const idx = parent.transitions.indexOf(t);
    if (idx !== -1) {
      parent.transitions.splice(idx, 1);
    }
  } else if ('transition' in parent && Array.isArray(parent.transition)) {
    parent.transition = parent.transition.filter((x) => x !== t);
  } else if ('transition' in parent && !Array.isArray(parent.transition)) {
    if (parent.transition === t) {
      delete parent.transition;
    }
  }
}

/** Removes a single id token from a space-separated list. */
function removeTargetToken(list: string, id: string): string {
  return parseIdList(list)
    .filter((part) => part !== id)
    .join(' ');
}
