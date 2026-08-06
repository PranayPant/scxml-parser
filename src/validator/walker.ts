/**
 * AST validation helpers.
 *
 * Shared utility functions used across the validator rules: target list
 * parsing, state collection, and hierarchy building.
 */
import type { ParallelNode, SCXMLDocument, StateNode, StateNodeLike } from '../types/ast';

/**
 * Splits a space-separated target / initial id list into individual ids,
 * dropping empty entries. Assumes a non-empty value (callers guard against
 * undefined/empty before invoking).
 */
export function parseIdList(value: string): string[] {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Collects every state-ish id in the document into the provided set. This
 * includes state, parallel, final, and history nodes.
 */
export function collectStateIds(doc: SCXMLDocument, ids: Set<string>): void {
  for (const id of collectAllStateIds(doc)) {
    ids.add(id);
  }
}

/**
 * Collects every state-ish id in the document, preserving duplicates, into an
 * array. Used for duplicate detection.
 */
export function collectAllStateIds(doc: SCXMLDocument): string[] {
  const ids: string[] = [];
  const root = doc.scxml;
  for (const s of root.states) {
    collectFromState(s, ids);
  }
  for (const p of root.parallels) {
    collectFromParallel(p, ids);
  }
  for (const f of root.finals) {
    ids.push(f.id);
  }
  return ids;
}

function collectFromState(state: StateNode, ids: string[]): void {
  ids.push(state.id);
  for (const s of state.states) {
    collectFromState(s, ids);
  }
  for (const p of state.parallels) {
    collectFromParallel(p, ids);
  }
  for (const f of state.finals) {
    ids.push(f.id);
  }
  for (const h of state.history) {
    ids.push(h.id);
  }
}

function collectFromParallel(parallel: ParallelNode, ids: string[]): void {
  ids.push(parallel.id);
  for (const s of parallel.states) {
    collectFromState(s, ids);
  }
  for (const p of parallel.parallels) {
    collectFromParallel(p, ids);
  }
  for (const h of parallel.history) {
    ids.push(h.id);
  }
}

/**
 * Builds a map from every state id to its parent state id (or null for
 * root-level states).
 */
export function buildStateHierarchy(
  doc: SCXMLDocument,
  parentMap: Map<string, string | null>,
): void {
  const root = doc.scxml;
  for (const s of root.states) {
    parentMap.set(s.id, null);
    buildFromState(s, s.id, parentMap);
  }
  for (const p of root.parallels) {
    parentMap.set(p.id, null);
    buildFromParallel(p, p.id, parentMap);
  }
  for (const f of root.finals) {
    parentMap.set(f.id, null);
  }
}

function buildFromState(
  state: StateNode,
  parentId: string,
  parentMap: Map<string, string | null>,
): void {
  for (const s of state.states) {
    parentMap.set(s.id, parentId);
    buildFromState(s, s.id, parentMap);
  }
  for (const p of state.parallels) {
    parentMap.set(p.id, parentId);
    buildFromParallel(p, p.id, parentMap);
  }
  for (const f of state.finals) {
    parentMap.set(f.id, parentId);
  }
  for (const h of state.history) {
    parentMap.set(h.id, parentId);
  }
}

function buildFromParallel(
  parallel: ParallelNode,
  parentId: string,
  parentMap: Map<string, string | null>,
): void {
  for (const s of parallel.states) {
    parentMap.set(s.id, parentId);
    buildFromState(s, s.id, parentMap);
  }
  for (const p of parallel.parallels) {
    parentMap.set(p.id, parentId);
    buildFromParallel(p, p.id, parentMap);
  }
  for (const h of parallel.history) {
    parentMap.set(h.id, parentId);
  }
}

/**
 * Walks every state-like node in the document.
 */
export function walkStateNodes(doc: SCXMLDocument, visit: (node: StateNodeLike) => void): void {
  const root = doc.scxml;
  for (const s of root.states) {
    visit(s);
    walkState(s, visit);
  }
  for (const p of root.parallels) {
    visit(p);
    walkParallel(p, visit);
  }
  for (const f of root.finals) {
    visit(f);
  }
}

function walkState(state: StateNode, visit: (node: StateNodeLike) => void): void {
  for (const s of state.states) {
    visit(s);
    walkState(s, visit);
  }
  for (const p of state.parallels) {
    visit(p);
    walkParallel(p, visit);
  }
  for (const f of state.finals) {
    visit(f);
  }
}

function walkParallel(parallel: ParallelNode, visit: (node: StateNodeLike) => void): void {
  for (const s of parallel.states) {
    visit(s);
    walkState(s, visit);
  }
  for (const p of parallel.parallels) {
    visit(p);
    walkParallel(p, visit);
  }
}
