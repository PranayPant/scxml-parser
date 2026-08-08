/**
 * SCXML AST -> formatted XML serialization.
 *
 * Walks the in-memory AST and emits standard, well-formed SCXML. Supports
 * pretty-printed and minified output, optional escaping, and lossless
 * round-tripping (AST -> XML -> AST).
 */
import { TagRegistry } from '../registry/TagRegistry';
import type {
  ContentElement,
  DataElement,
  DoneDataElement,
  ExecutableContent,
  FinalNode,
  HistoryNode,
  InitialBlock,
  InvokeElement,
  MetadataBlock,
  ParallelNode,
  ParamElement,
  SCXMLDocument,
  SCXMLElement,
  ScriptElement,
  StateNode,
  Transition,
} from '../types/ast';
import type { CustomASTNode } from '../types/extensibility';
import type { SerializationOptions } from '../types/options';

/** The set of XML reserved characters and their escapes. */
const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const XML_UNESCAPES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/**
 * Serializes an AST back to formatted SCXML XML.
 *
 * @param doc - The SCXML AST to serialize.
 * @param options - Serialization options.
 * @returns The formatted SCXML XML string.
 */
export function serializeSCXML(doc: SCXMLDocument, options: SerializationOptions = {}): string {
  const {
    pretty = true,
    indent: indentSize = 2,
    escapeText = true,
    includeStateTypes = false,
  } = options;

  const ctx: SerializeContext = {
    pretty,
    indentSize,
    escapeText,
    includeStateTypes,
  };

  const root = doc.scxml;
  return `${renderSCXMLElement(root, ctx, 0)}\n`;
}

/**
 * Internal serialization context baked from options.
 */
interface SerializeContext {
  pretty: boolean;
  indentSize: number;
  escapeText: boolean;
  includeStateTypes: boolean;
}

/**
 * Builds a newline + indentation prefix for the given depth.
 */
function newline(ctx: SerializeContext, depth: number): string {
  if (!ctx.pretty) {
    return '';
  }
  return `\n${' '.repeat(depth * ctx.indentSize)}`;
}

/**
 * Renders the root <scxml> element.
 */
function renderSCXMLElement(el: SCXMLElement, ctx: SerializeContext, depth: number): string {
  const attrs: Array<[string, string]> = [];
  if (el.name !== undefined) {
    attrs.push(['name', el.name]);
  }
  if (el.xmlns !== undefined) {
    attrs.push(['xmlns', el.xmlns]);
  }
  if (el.version !== undefined) {
    attrs.push(['version', el.version]);
  }
  if (el.datamodel !== undefined) {
    attrs.push(['datamodel', String(el.datamodel)]);
  }
  if (el.binding !== undefined) {
    attrs.push(['binding', el.binding]);
  }
  if (el.initial !== undefined) {
    attrs.push(['initial', el.initial]);
  }

  const children: string[] = [];
  if (el.scripts && el.scripts.length > 0) {
    for (const s of el.scripts) {
      children.push(
        renderOpenTag('script', scriptAttrs(s), ctx, depth + 1) +
          renderText(s.text, ctx) +
          renderCloseTag('script', ctx, depth + 1),
      );
    }
  }
  if (el.datamodelChildren && el.datamodelChildren.length > 0) {
    children.push(renderDatamodel(el.datamodelChildren, ctx, depth + 1));
  }
  for (const state of el.states) {
    children.push(renderStateNode(state, ctx, depth + 1));
  }
  for (const parallel of el.parallels) {
    children.push(renderParallelNode(parallel, ctx, depth + 1));
  }
  for (const final of el.finals) {
    children.push(renderFinalNode(final, ctx, depth + 1));
  }
  const metadata = renderMetadataContainer(el.metadata, el.customChildren, ctx, depth + 1);
  if (metadata) {
    children.push(metadata);
  }

  return renderContainer('scxml', attrs, children, ctx, depth);
}

/**
 * Renders a <state> element.
 */
function renderStateNode(state: StateNode, ctx: SerializeContext, depth: number): string {
  const attrs: Array<[string, string]> = [['id', state.id]];
  if (ctx.includeStateTypes && state.type) {
    attrs.push(['type', state.type]);
  }
  if (state.initial !== undefined) {
    attrs.push(['initial', state.initial]);
  }

  const children: string[] = [];
  if (state.onentry && state.onentry.length > 0) {
    children.push(renderExecutableContainer('onentry', state.onentry, ctx, depth + 1));
  }
  if (state.onexit && state.onexit.length > 0) {
    children.push(renderExecutableContainer('onexit', state.onexit, ctx, depth + 1));
  }
  if (state.initialBlock) {
    children.push(renderInitialBlock(state.initialBlock, ctx, depth + 1));
  }
  for (const t of state.transitions) {
    children.push(renderTransition(t, ctx, depth + 1));
  }
  if (state.datamodel && state.datamodel.length > 0) {
    children.push(renderDatamodel(state.datamodel, ctx, depth + 1));
  }
  for (const child of state.states) {
    children.push(renderStateNode(child, ctx, depth + 1));
  }
  for (const p of state.parallels) {
    children.push(renderParallelNode(p, ctx, depth + 1));
  }
  for (const f of state.finals) {
    children.push(renderFinalNode(f, ctx, depth + 1));
  }
  for (const h of state.history) {
    children.push(renderHistoryNode(h, ctx, depth + 1));
  }
  for (const invoke of state.invoke) {
    children.push(renderInvokeElement(invoke, ctx, depth + 1));
  }
  const metadata = renderMetadataContainer(state.metadata, state.customChildren, ctx, depth + 1);
  if (metadata) {
    children.push(metadata);
  }

  return renderContainer('state', attrs, children, ctx, depth);
}

/**
 * Renders a <parallel> element.
 */
function renderParallelNode(parallel: ParallelNode, ctx: SerializeContext, depth: number): string {
  const attrs: Array<[string, string]> = [['id', parallel.id]];

  const children: string[] = [];
  if (parallel.onentry && parallel.onentry.length > 0) {
    children.push(renderExecutableContainer('onentry', parallel.onentry, ctx, depth + 1));
  }
  if (parallel.onexit && parallel.onexit.length > 0) {
    children.push(renderExecutableContainer('onexit', parallel.onexit, ctx, depth + 1));
  }
  if (parallel.initialBlock) {
    children.push(renderInitialBlock(parallel.initialBlock, ctx, depth + 1));
  }
  for (const t of parallel.transitions) {
    children.push(renderTransition(t, ctx, depth + 1));
  }
  if (parallel.datamodel && parallel.datamodel.length > 0) {
    children.push(renderDatamodel(parallel.datamodel, ctx, depth + 1));
  }
  for (const child of parallel.states) {
    children.push(renderStateNode(child, ctx, depth + 1));
  }
  for (const p of parallel.parallels) {
    children.push(renderParallelNode(p, ctx, depth + 1));
  }
  for (const f of parallel.finals) {
    children.push(renderFinalNode(f, ctx, depth + 1));
  }
  for (const h of parallel.history) {
    children.push(renderHistoryNode(h, ctx, depth + 1));
  }
  for (const invoke of parallel.invoke) {
    children.push(renderInvokeElement(invoke, ctx, depth + 1));
  }
  const metadata = renderMetadataContainer(
    parallel.metadata,
    parallel.customChildren,
    ctx,
    depth + 1,
  );
  if (metadata) {
    children.push(metadata);
  }

  return renderContainer('parallel', attrs, children, ctx, depth);
}

/**
 * Renders a <final> element.
 */
function renderFinalNode(final: FinalNode, ctx: SerializeContext, depth: number): string {
  const children: string[] = [];
  if (final.onentry && final.onentry.length > 0) {
    children.push(renderExecutableContainer('onentry', final.onentry, ctx, depth + 1));
  }
  if (final.onexit && final.onexit.length > 0) {
    children.push(renderExecutableContainer('onexit', final.onexit, ctx, depth + 1));
  }
  if (final.donedata) {
    children.push(renderDonedata(final.donedata, ctx, depth + 1));
  }
  const metadata = renderMetadataContainer(final.metadata, final.customChildren, ctx, depth + 1);
  if (metadata) {
    children.push(metadata);
  }
  return renderContainer('final', [['id', final.id]], children, ctx, depth);
}

/**
 * Renders a <history> element.
 */
function renderHistoryNode(history: HistoryNode, ctx: SerializeContext, depth: number): string {
  const attrs: Array<[string, string]> = [['id', history.id]];
  if (history.type && history.type !== 'shallow') {
    attrs.push(['type', history.type]);
  }
  const children: string[] = [];
  if (history.transition) {
    children.push(renderTransition(history.transition, ctx, depth + 1));
  }
  return renderContainer('history', attrs, children, ctx, depth);
}

/**
 * Renders a <transition> element.
 */
function renderTransition(t: Transition, ctx: SerializeContext, depth: number): string {
  const attrs: Array<[string, string]> = [];
  if (t.event !== undefined) {
    attrs.push(['event', t.event]);
  }
  if (t.cond !== undefined) {
    attrs.push(['cond', t.cond]);
  }
  if (t.target !== undefined) {
    attrs.push(['target', t.target]);
  }
  if (t.type !== undefined && t.type !== 'external') {
    attrs.push(['type', t.type]);
  }

  const children: string[] = [];
  if (t.executable && t.executable.length > 0) {
    for (const e of t.executable) {
      children.push(renderExecutableElement(e, ctx, depth + 1));
    }
  }
  const metadata = renderMetadataContainer(t.metadata, t.customChildren, ctx, depth + 1);
  if (metadata) {
    children.push(metadata);
  }
  return renderContainer('transition', attrs, children, ctx, depth);
}

/**
 * Renders a custom (non-standard) AST node, delegating to its registered
 * `serialize` hook or falling back to generic key/value XML formatting.
 */
function renderCustomASTNode(node: CustomASTNode, ctx: SerializeContext, depth: number): string {
  const spec = TagRegistry.getInstance().get(node.tagName);
  if (spec?.serialize) {
    return spec.serialize(node, depth);
  }

  const attrs = Object.entries(node.attributes).map(([k, v]) => [k, v] as [string, string]);
  if (node.textContent !== undefined) {
    return (
      renderOpenTag(node.tagName, attrs, ctx, depth) +
      renderText(node.textContent, ctx) +
      renderCloseTag(node.tagName, ctx, depth)
    );
  }
  return renderSelfClosing(node.tagName, attrs, ctx, depth);
}

/**
 * Renders an <initial> block with its default transitions.
 */
function renderInitialBlock(block: InitialBlock, ctx: SerializeContext, depth: number): string {
  const children: string[] = [];
  if (block.transition && block.transition.length > 0) {
    for (const t of block.transition) {
      children.push(renderTransition(t, ctx, depth + 1));
    }
  }
  if (block.blocks) {
    for (const nested of block.blocks) {
      children.push(renderInitialBlock(nested, ctx, depth + 1));
    }
  }
  return renderContainer('initial', [], children, ctx, depth);
}

/**
 * Renders a <datamodel> container with its <data> children.
 */
function renderDatamodel(data: DataElement[], ctx: SerializeContext, depth: number): string {
  const children = data.map((d) => {
    const attrs: Array<[string, string]> = [['id', d.id]];
    if (d.src !== undefined) {
      attrs.push(['src', d.src]);
    }
    if (d.expr !== undefined) {
      attrs.push(['expr', d.expr]);
    }
    if (d.confType !== undefined) {
      attrs.push(['confType', d.confType]);
    }
    if (d.text !== undefined) {
      return (
        renderOpenTag('data', attrs, ctx, depth + 1) +
        renderText(d.text, ctx) +
        renderCloseTag('data', ctx, depth + 1)
      );
    }
    return renderSelfClosing('data', attrs, ctx, depth + 1);
  });
  return renderContainer('datamodel', [], children, ctx, depth);
}

/**
 * Renders an <invoke> element.
 */
function renderInvokeElement(invoke: InvokeElement, ctx: SerializeContext, depth: number): string {
  const attrs: Array<[string, string]> = [];
  if (invoke.type !== undefined) {
    attrs.push(['type', invoke.type]);
  }
  if (invoke.src !== undefined) {
    attrs.push(['src', invoke.src]);
  }
  if (invoke.id !== undefined) {
    attrs.push(['id', invoke.id]);
  }
  if (invoke.idlocation !== undefined) {
    attrs.push(['idlocation', invoke.idlocation]);
  }
  if (invoke.srcexpr !== undefined) {
    attrs.push(['srcexpr', invoke.srcexpr]);
  }
  if (invoke.autoforward !== undefined) {
    attrs.push(['autoforward', String(invoke.autoforward)]);
  }

  const children: string[] = [];
  if (invoke.param && invoke.param.length > 0) {
    for (const p of invoke.param) {
      children.push(renderParam(p, ctx, depth + 1));
    }
  }
  if (invoke.finalize && invoke.finalize.length > 0) {
    children.push(renderExecutableContainer('finalize', invoke.finalize, ctx, depth + 1));
  }
  if (invoke.content) {
    children.push(renderContent(invoke.content, ctx, depth + 1));
  }

  return renderContainer('invoke', attrs, children, ctx, depth);
}

/**
 * Renders a <param> element.
 */
function renderParam(p: ParamElement, ctx: SerializeContext, depth: number): string {
  const attrs: Array<[string, string]> = [['name', p.name]];
  if (p.expr !== undefined) {
    attrs.push(['expr', p.expr]);
  }
  if (p.location !== undefined) {
    attrs.push(['location', p.location]);
  }
  return renderSelfClosing('param', attrs, ctx, depth);
}

/**
 * Renders a <content> element.
 */
function renderContent(content: ContentElement, ctx: SerializeContext, depth: number): string {
  const attrs: Array<[string, string]> = [];
  if (content.expr !== undefined) {
    attrs.push(['expr', content.expr]);
  }
  if (content.text !== undefined) {
    return (
      renderOpenTag('content', attrs, ctx, depth) +
      renderText(content.text, ctx) +
      renderCloseTag('content', ctx, depth)
    );
  }
  return renderSelfClosing('content', attrs, ctx, depth);
}

/**
 * Renders a <donedata> element.
 */
function renderDonedata(donedata: DoneDataElement, ctx: SerializeContext, depth: number): string {
  const children: string[] = [];
  if (donedata.content) {
    children.push(renderContent(donedata.content, ctx, depth + 1));
  }
  if (donedata.param && donedata.param.length > 0) {
    for (const p of donedata.param) {
      children.push(renderParam(p, ctx, depth + 1));
    }
  }
  return renderContainer('donedata', [], children, ctx, depth);
}

/**
 * Renders a container of executable content (e.g. <onentry>).
 */
function renderExecutableContainer(
  tag: string,
  executable: ExecutableContent[],
  ctx: SerializeContext,
  depth: number,
): string {
  const children = executable.map((e) => renderExecutableElement(e, ctx, depth + 1));
  return renderContainer(tag, [], children, ctx, depth);
}

/**
 * Renders a single executable content element.
 */
function renderExecutableElement(
  e: ExecutableContent,
  ctx: SerializeContext,
  depth: number,
): string {
  // ScriptElement has no `kind` discriminator, so detect it explicitly.
  if (isScriptElement(e)) {
    return (
      renderOpenTag('script', scriptAttrs(e), ctx, depth) +
      renderText(e.text, ctx) +
      renderCloseTag('script', ctx, depth)
    );
  }
  switch (e.kind) {
    case 'raise':
      return renderSelfClosing('raise', [['event', e.event]], ctx, depth);
    case 'if':
      return renderExecBlock('if', [['cond', e.cond]], e.executable, ctx, depth);
    case 'elseif':
      return renderExecBlock('elseif', [['cond', e.cond]], e.executable, ctx, depth);
    case 'else':
      return renderExecBlock('else', [], e.executable, ctx, depth);
    case 'foreach': {
      const attrs: Array<[string, string]> = [
        ['array', e.array],
        ['item', e.item],
      ];
      if (e.index !== undefined) {
        attrs.push(['index', e.index]);
      }
      return renderExecBlock('foreach', attrs, e.executable, ctx, depth);
    }
    case 'log': {
      const attrs: Array<[string, string]> = [];
      if (e.label !== undefined) {
        attrs.push(['label', e.label]);
      }
      if (e.expr !== undefined) {
        attrs.push(['expr', e.expr]);
      }
      return renderSelfClosing('log', attrs, ctx, depth);
    }
    case 'assign': {
      const attrs: Array<[string, string]> = [['location', e.location]];
      if (e.expr !== undefined) {
        attrs.push(['expr', e.expr]);
      }
      return renderSelfClosing('assign', attrs, ctx, depth);
    }
    case 'send': {
      const attrs: Array<[string, string]> = [];
      if (e.event !== undefined) {
        attrs.push(['event', e.event]);
      }
      if (e.eventexpr !== undefined) {
        attrs.push(['eventexpr', e.eventexpr]);
      }
      if (e.target !== undefined) {
        attrs.push(['target', e.target]);
      }
      if (e.targetexpr !== undefined) {
        attrs.push(['targetexpr', e.targetexpr]);
      }
      if (e.type !== undefined) {
        attrs.push(['type', e.type]);
      }
      if (e.typeexpr !== undefined) {
        attrs.push(['typeexpr', e.typeexpr]);
      }
      if (e.id !== undefined) {
        attrs.push(['id', e.id]);
      }
      if (e.idlocation !== undefined) {
        attrs.push(['idlocation', e.idlocation]);
      }
      if (e.delay !== undefined) {
        attrs.push(['delay', e.delay]);
      }
      if (e.delayexpr !== undefined) {
        attrs.push(['delayexpr', e.delayexpr]);
      }
      if (e.namelist !== undefined) {
        attrs.push(['namelist', e.namelist]);
      }
      const children: string[] = [];
      if (e.param && e.param.length > 0) {
        for (const p of e.param) {
          children.push(renderParam(p, ctx, depth + 1));
        }
      }
      if (e.content) {
        children.push(renderContent(e.content, ctx, depth + 1));
      }
      return renderContainer('send', attrs, children, ctx, depth);
    }
    case 'cancel': {
      const attrs: Array<[string, string]> = [];
      if (e.sendid !== undefined) {
        attrs.push(['sendid', e.sendid]);
      }
      if (e.sendidexpr !== undefined) {
        attrs.push(['sendidexpr', e.sendidexpr]);
      }
      return renderSelfClosing('cancel', attrs, ctx, depth);
    }
  }
}

/**
 * Script element attribute helper (shared with root-level scripts).
 */
function scriptAttrs(script: ScriptElement): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  if (script.src !== undefined) {
    attrs.push(['src', script.src]);
  }
  return attrs;
}

/**
 * Type guard distinguishing a ScriptElement from the rest of the executable
 * content union. ScriptElement is the only executable member without a
 * `kind` discriminator.
 */
function isScriptElement(e: ExecutableContent): e is ScriptElement {
  return !('kind' in e);
}

/**
 * Renders a block-style executable element (`if`, `elseif`, `else`,
 * `foreach`) that contains nested executable content or is otherwise a
 * container.
 */
function renderExecBlock(
  tag: string,
  attrs: Array<[string, string]>,
  executable: ExecutableContent[],
  ctx: SerializeContext,
  depth: number,
): string {
  const children = executable.map((e) => renderExecutableElement(e, ctx, depth + 1));
  return renderContainer(tag, attrs, children, ctx, depth);
}

/**
 * Renders a metadata (extension / namespace) block.
 */
function renderMetadataBlock(block: MetadataBlock, ctx: SerializeContext, depth: number): string {
  const attrs = Object.entries(block.attributes).map(([k, v]) => [k, v] as [string, string]);
  if (block.text !== undefined) {
    return (
      renderOpenTag(block.tag, attrs, ctx, depth) +
      renderText(String(block.text), ctx) +
      renderCloseTag(block.tag, ctx, depth)
    );
  }
  return renderSelfClosing(block.tag, attrs, ctx, depth);
}

/**
 * Renders a single <metadata> container holding both opaque metadata blocks
 * and registered custom children, mirroring how the parser extracts them.
 * Emits nothing when there is no metadata or custom content.
 */
function renderMetadataContainer(
  metadata: MetadataBlock[] | undefined,
  customChildren: CustomASTNode[] | undefined,
  ctx: SerializeContext,
  depth: number,
): string {
  const children: string[] = [];
  if (metadata) {
    for (const block of metadata) {
      children.push(renderMetadataBlock(block, ctx, depth + 1));
    }
  }
  if (customChildren) {
    for (const custom of customChildren) {
      children.push(renderCustomASTNode(custom, ctx, depth + 1));
    }
  }
  if (children.length === 0) {
    return '';
  }
  return renderContainer('metadata', [], children, ctx, depth);
}

/**
 * Renders a container element (opening tag + children + closing tag),
 * choosing self-closing form when there are no children and no text.
 */
function renderContainer(
  tag: string,
  attrs: Array<[string, string]>,
  children: string[],
  ctx: SerializeContext,
  depth: number,
): string {
  if (children.length === 0) {
    return renderSelfClosing(tag, attrs, ctx, depth);
  }
  const nl = newline;
  return `${renderOpenTag(tag, attrs, ctx, depth) + children.join('') + nl(ctx, depth + 1)}</${tag}>`;
}

/**
 * Renders an opening tag with attributes.
 */
function renderOpenTag(
  tag: string,
  attrs: Array<[string, string]>,
  ctx: SerializeContext,
  depth: number,
): string {
  const nl = newline(ctx, depth);
  const attrStr = attrs.map(([k, v]) => `${k}="${escapeAttr(v, ctx)}"`).join(' ');
  return `${nl}<${tag}${attrStr ? ` ${attrStr}` : ''}>`;
}

/**
 * Renders a self-closing tag.
 */
function renderSelfClosing(
  tag: string,
  attrs: Array<[string, string]>,
  ctx: SerializeContext,
  depth: number,
): string {
  const nl = newline(ctx, depth);
  const attrStr = attrs.map(([k, v]) => `${k}="${escapeAttr(v, ctx)}"`).join(' ');
  return `${nl}<${tag}${attrStr ? ` ${attrStr}` : ''} />`;
}

/**
 * Renders a closing tag.
 */
function renderCloseTag(tag: string, ctx: SerializeContext, depth: number): string {
  const nl = newline(ctx, depth);
  return `${nl}</${tag}>`;
}

/**
 * Wraps text content with escaping (when enabled).
 */
function renderText(text: string | undefined, ctx: SerializeContext): string {
  if (text === undefined || text === null) {
    return '';
  }
  return ctx.escapeText ? escapeText(String(text)) : String(text);
}

/**
 * Escapes reserved XML characters inside an attribute value.
 */
function escapeAttr(value: string, ctx: SerializeContext): string {
  return ctx.escapeText ? escapeText(value) : value;
}

/**
 * Escapes reserved XML characters in text content.
 */
function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

/**
 * Un-escapes previously escaped XML entities. Primarily useful in tests to
 * verify round-trip fidelity.
 */
export function unescapeXML(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_UNESCAPES[m]);
}
