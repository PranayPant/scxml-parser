/**
 * SCXML AST -> Mermaid state diagram conversion.
 *
 * Renders an SCXML AST as a Mermaid `stateDiagram-v2` diagram so statecharts
 * can be visualized directly in GitHub, Notion, Mermaid Live Editor, or any
 * Mermaid renderer. Complements the ASCII `printAST` debugger with a
 * standardized graph representation.
 */
import { parserTracer } from '../tracing';
import type {
  FinalNode,
  HistoryNode,
  ParallelNode,
  SCXMLDocument,
  StateNode,
  Transition,
} from '../types/ast';

/** Any node that can appear as a child within a compound state. */
type ChildNode = StateNode | ParallelNode | FinalNode | HistoryNode;

/** Any node that owns declared transitions. */
type TransitionOwner = StateNode | ParallelNode;

/**
 * Options controlling Mermaid conversion output.
 */
export interface MermaidOptions {
  /**
   * Diagram direction. Mermaid accepts 'LR' (left-right) and 'TB'
   * (top-bottom). Default 'LR'.
   */
  direction?: 'LR' | 'TB';
  /**
   * Include the diagram `title` derived from the SCXML `name`. Default true.
   */
  includeTitle?: boolean;
  /**
   * Show event and condition on transition edge labels. Default true.
   */
  includeEdgeLabels?: boolean;
}

/**
 * Renders an SCXML AST as a Mermaid `stateDiagram-v2` diagram.
 *
 * @param doc - The SCXML AST to convert.
 * @param options - Controls diagram direction, title, and edge labels.
 * @returns A Mermaid state diagram string.
 */
export function toMermaid(doc: SCXMLDocument, options: MermaidOptions = {}): string {
  const { direction = 'LR', includeTitle = true, includeEdgeLabels = true } = options;
  const lines: string[] = [];
  const root = doc.scxml;

  return parserTracer.withSpan('parser.toMermaid', {}, () => {
    lines.push('stateDiagram-v2');
    if (includeTitle && root.name) {
      lines.push(`    title ${escapeLabel(root.name)}`);
    }
    lines.push(`    direction ${direction}`);

    // Render the root’s direct children (states, parallels, finals).
    const rootChildren: ChildNode[] = [...root.states, ...root.parallels, ...root.finals];
    for (const child of rootChildren) {
      renderChild(child, 1, lines, includeEdgeLabels);
    }

    // Initial arrow: point at the document initial state (or the first child).
    const initialId = root.initial?.split(/\s+/)[0] ?? rootChildren[0]?.id;
    if (initialId) {
      lines.push(`    [*] --> ${mermaidId(initialId)}`);
    }

    return `${lines.join('\n')}\n`;
  });
}

/**
 * Renders a single child node (state / parallel / final / history) and all
 * of its descendants.
 */
function renderChild(
  node: ChildNode,
  depth: number,
  lines: string[],
  includeEdgeLabels: boolean,
): void {
  const indent = '    '.repeat(depth);

  // History pseudo-state.
  if (isHistory(node)) {
    lines.push(`${indent}state ${mermaidId(node.id)} <<history>>`);
    return;
  }

  // Final state.
  if (isFinal(node)) {
    lines.push(`${indent}state ${mermaidId(node.id)} <<final>>`);
    return;
  }

  const owner = node as TransitionOwner;
  const children: ChildNode[] = [
    ...owner.states,
    ...owner.parallels,
    ...owner.finals,
    ...owner.history,
  ];

  const label = escapeLabel(owner.id);
  if (children.length > 0) {
    // Compound state: emit a nested block.
    lines.push(`${indent}state "${label}" as ${mermaidId(owner.id)} {`);
    lines.push(`${indent}    direction ${'LR'}`);
    for (const child of children) {
      renderChild(child, depth + 1, lines, includeEdgeLabels);
    }
    lines.push(`${indent}}`);
  } else {
    lines.push(`${indent}state "${label}" as ${mermaidId(owner.id)}`);
  }

  // Transitions declared on this node (the parser always sets an array).
  const transitions = owner.transitions;
  if (transitions.length > 0) {
    const childIndent = '    '.repeat(depth + 1);
    renderTransitions(owner.id, transitions, childIndent, lines, includeEdgeLabels);
  }

  // Explicit <initial> block default transitions.
  if (owner.initialBlock?.transition) {
    const childIndent = '    '.repeat(depth + 1);
    renderTransitions(
      owner.id,
      owner.initialBlock.transition,
      childIndent,
      lines,
      includeEdgeLabels,
    );
  }
}

/**
 * Renders the edges for a list of transitions sourced from `fromId`.
 */
function renderTransitions(
  fromId: string,
  transitions: Transition[],
  indent: string,
  lines: string[],
  includeEdgeLabels: boolean,
): void {
  for (const t of transitions) {
    const source = mermaidId(fromId);
    const targets = t.target ? t.target.split(/\s+/) : [];

    if (targets.length === 0) {
      // Internal/self transition with no target: self-loop.
      lines.push(`${indent}${source} --> ${source}${edgeLabel(t, includeEdgeLabels)}`);
      continue;
    }

    for (const target of targets) {
      lines.push(`${indent}${source} --> ${mermaidId(target)}${edgeLabel(t, includeEdgeLabels)}`);
    }
  }
}

/**
 * Builds the edge label for a transition (event and/or condition).
 */
function edgeLabel(t: Transition, includeEdgeLabels: boolean): string {
  if (!includeEdgeLabels) {
    return '';
  }
  const parts: string[] = [];
  if (t.event) {
    parts.push(t.event);
  }
  if (t.cond) {
    parts.push(`[${t.cond}]`);
  }
  return parts.length > 0 ? ` : ${parts.join(' ')}` : '';
}

/**
 * Sanitizes a state id for use as a Mermaid state identifier.
 */
function mermaidId(id: string): string {
  // Mermaid ids allow letters, digits, and underscores; replace anything else.
  const clean = id.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(clean) ? clean : `_${clean}`;
}

/**
 * Escapes label text so it renders literally inside a quoted Mermaid label.
 */
function escapeLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}

/**
 * Type guard: a history pseudo-state has no `states` array and exposes a
 * `type` of 'shallow' | 'deep'.
 */
function isHistory(node: ChildNode): node is HistoryNode {
  return !Array.isArray((node as StateNode).states) && (node as HistoryNode).type !== undefined;
}

/**
 * Type guard: a final node has no `states` array and no history `type`.
 */
function isFinal(node: ChildNode): node is FinalNode {
  return !Array.isArray((node as StateNode).states) && (node as HistoryNode).type === undefined;
}
