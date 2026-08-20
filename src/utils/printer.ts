/**
 * Visual AST debugger.
 *
 * Renders an SCXML AST as an ASCII visual tree for quick inspection during
 * development, scripting, or CLI usage.
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
import type { PrintASTOptions } from '../types/options';

/**
 * Renders an SCXML AST as an ASCII visual tree structure.
 *
 * @param doc - The SCXML AST to print.
 * @param options - Controls which sections are included.
 * @returns A multi-line ASCII tree representation.
 */
export function printAST(doc: SCXMLDocument, options: PrintASTOptions = {}): string {
  const { includeMetadata = true, includeDatamodel = true, includeTransitions = true } = options;

  return parserTracer.withSpan('parser.printAST', {}, () => {
    const ctx: PrintContext = {
      includeMetadata,
      includeDatamodel,
      includeTransitions,
    };

    const buffer: string[] = [];
    const root = doc.scxml;

    buffer.push(
      `SCXML Root [initial: "${root.initial || 'N/A'}"${root.name ? `, name: "${root.name}"` : ''}]`,
    );

    // Datamodel section.
    if (ctx.includeDatamodel && root.datamodelChildren && root.datamodelChildren.length > 0) {
      buffer.push(`├── 📦 <datamodel>`);
      root.datamodelChildren.forEach((data, idx) => {
        const isLast = idx === root.datamodelChildren!.length - 1;
        const prefix = isLast ? '│   └──' : '│   ├──';
        buffer.push(`${prefix} id: "${data.id}" = ${data.expr ?? data.text ?? 'undefined'}`);
      });
    }

    // Render root-level state-like children.
    const rootBlocks: ChildBlock[] = [];
    for (const s of root.states) {
      rootBlocks.push(stateToBlock(s));
    }
    for (const p of root.parallels) {
      rootBlocks.push(parallelToBlock(p));
    }
    for (const f of root.finals) {
      rootBlocks.push(finalToBlock(f));
    }

    const hasMetadata = ctx.includeMetadata && root.metadata.length > 0;

    for (let i = 0; i < rootBlocks.length; i++) {
      const block = rootBlocks[i];
      const isLastRoot = i === rootBlocks.length - 1;
      const branch = isLastRoot && !hasMetadata ? '└──' : '├──';
      renderBlock(block, branch, '', buffer, ctx);
    }

    // Metadata summary.
    if (hasMetadata) {
      buffer.push(`└── 🏷️  <metadata> (${root.metadata.length} blocks present)`);
    }

    return buffer.join('\n');
  });
}

/**
 * Internal printer context.
 */
interface PrintContext {
  includeMetadata: boolean;
  includeDatamodel: boolean;
  includeTransitions: boolean;
}

/**
 * A normalized descriptor for any renderable node so the recursive renderer
 * can treat states, parallels, finals, and histories uniformly.
 */
interface ChildBlock {
  emoji: string;
  label: string;
  typeLabel?: string;
  transitions: Transition[];
  children: ChildBlock[];
}

/**
 * Builds a ChildBlock from a state node.
 */
function stateToBlock(state: StateNode): ChildBlock {
  return {
    emoji: '🟢',
    label: `State("${state.id}")`,
    typeLabel: state.type,
    transitions: state.transitions,
    children: [
      ...state.states.map(stateToBlock),
      ...state.parallels.map(parallelToBlock),
      ...state.finals.map(finalToBlock),
      ...state.history.map(historyToBlock),
    ],
  };
}

/**
 * Builds a ChildBlock from a parallel node.
 */
function parallelToBlock(parallel: ParallelNode): ChildBlock {
  return {
    emoji: '🟦',
    label: `Parallel("${parallel.id}")`,
    transitions: parallel.transitions,
    children: [
      ...parallel.states.map(stateToBlock),
      ...parallel.parallels.map(parallelToBlock),
      ...parallel.history.map(historyToBlock),
    ],
  };
}

/**
 * Builds a ChildBlock from a final node.
 */
function finalToBlock(final: FinalNode): ChildBlock {
  return {
    emoji: '🏁',
    label: `Final("${final.id}")`,
    transitions: [],
    children: [],
  };
}

/**
 * Builds a ChildBlock from a history node.
 */
function historyToBlock(history: HistoryNode): ChildBlock {
  return {
    emoji: '🕘',
    label: `History("${history.id}")`,
    typeLabel: history.type === 'deep' ? 'deep' : undefined,
    transitions: [],
    children: [],
  };
}

/**
 * Renders a ChildBlock and all of its descendants into the buffer using the
 * given branch prefix and ancestor-indent string.
 */
function renderBlock(
  block: ChildBlock,
  branch: string,
  ancestorIndent: string,
  buffer: string[],
  ctx: PrintContext,
): void {
  const typeLabel = block.typeLabel ? ` [${block.typeLabel}]` : '';
  buffer.push(`${ancestorIndent}${branch} ${block.emoji} ${block.label}${typeLabel}`);

  const childIndent = ancestorIndent + (branch === '└──' ? '    ' : '│   ');

  // Transitions.
  if (ctx.includeTransitions && block.transitions.length > 0) {
    block.transitions.forEach((t, tIdx) => {
      const isLastTransition = tIdx === block.transitions.length - 1;
      const hasChildren = block.children.length > 0;
      const tBranch = isLastTransition && !hasChildren ? '└──' : '├──';
      buffer.push(`${childIndent}${tBranch} ⚡ ${formatTransition(t)}`);
    });
  }

  // Children.
  block.children.forEach((child, cIdx) => {
    const isLastChild = cIdx === block.children.length - 1;
    const childBranch = isLastChild ? '└──' : '├──';
    renderBlock(child, childBranch, childIndent, buffer, ctx);
  });
}

/**
 * Formats a transition into a compact label.
 */
function formatTransition(t: Transition): string {
  const eventLabel = t.event ? `event: "${t.event}"` : 'always';
  const condLabel = t.cond ? ` [cond: ${t.cond}]` : '';
  const targetLabel = t.target ? ` ➔ ${JSON.stringify(t.target.split(/\s+/))}` : ' ➔ (internal)';
  return `Transition(${eventLabel}${condLabel})${targetLabel}`;
}
