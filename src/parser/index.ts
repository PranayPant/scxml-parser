/**
 * Raw XML -> SCXML AST conversion.
 *
 * Uses `fast-xml-parser` to turn raw XML text into a lightweight object
 * tree, then normalizes that tree into the engine's SCXML AST. This layer
 * is fully UI-agnostic — it never touches the DOM, Monaco, or any store.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { TagRegistry } from '../registry/TagRegistry';
import { parserTracer } from '../tracing';
import type {
  ContentElement,
  DataElement,
  DoneDataElement,
  ExecutableContent,
  FinalNode,
  ForEachElement,
  HistoryNode,
  InitialBlock,
  InvokeElement,
  MetadataBlock,
  ParallelNode,
  ParamElement,
  SCXMLDocument,
  SCXMLElement,
  ScriptElement,
  ScxmlStringRange,
  SendElement,
  StateNode,
  StateType,
  Transition,
} from '../types/ast';
import type { ParseResult, PartialParseResult, ValidationDiagnostic } from '../types/diagnostics';
import type { CustomASTNode, CustomTagParseContext } from '../types/extensibility';
import type { ParseOptions } from '../types/options';
import { type RangeMap, scanElementRanges } from './positions';

/** The raw object-tree shapes emitted by fast-xml-parser. */
type RawRecord = Record<string, unknown>;

/** Attribute keys produced by fast-xml-parser carry this prefix. */
const ATTR_PREFIX = '@_';
/** Text nodes produced by fast-xml-parser use this key. */
const TEXT_KEY = '#text';

/**
 * Parser configuration for fast-xml-parser.
 */
const PARSER_CONFIG = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_KEY,
  parseAttributeValue: false,
  trimValues: true,
  parseTagValue: true,
  allowBooleanAttributes: false,
};

/**
 * A minimal synthetic error type used to unify fast-xml-parser's
 * XMLValidator error shape.
 */
interface XMLErrorLike {
  err: {
    msg: string;
    line: number;
    col: number;
    code?: string;
  };
}

/**
 * Module-scoped diagnostics collected during normalization (e.g. misplaced
 * custom tags that appear outside `<metadata>`). Reset per parse call and
 * merged into the returned result so deep-normalization warnings surface
 * without threading a diagnostics array through every normalizer.
 */
let parserDiagnostics: ValidationDiagnostic[] = [];

/**
 * Per-parse counter for deriving unique transition ids. Tracks how many
 * times each `source:target` key has been generated so the Nth duplicate
 * becomes `${key}_${n}`. Reset per parse call.
 */
let parserTransitionKeyCounts = new Map<string, number>();

/**
 * Per-parse source-range map populated when `captureStringPositions` is on.
 * Reset per parse call. See `src/parser/positions.ts`.
 */
let parserRangeMap: RangeMap | null = null;

/**
 * Parses a raw SCXML string into an in-memory AST.
 *
 * @param xmlString - Raw SCXML XML content (or any well-formed XML).
 * @param options - Optional parse options (e.g. captureStringPositions).
 * @returns A ParseResult containing the AST on success and diagnostics.
 */
export function parseSCXML(xmlString: string, options: ParseOptions = {}): ParseResult {
  return parserTracer.withSpan(
    'parser.parseSCXML',
    { 'scxml.input.length': xmlString.length },
    () => {
      const core = parseCore(xmlString, options);
      if (core.document === undefined) {
        return { success: false, errors: core.diagnostics };
      }
      const allErrors = [...core.diagnostics, ...parserDiagnostics];
      return {
        success: allErrors.every((d) => d.severity !== 'error'),
        data: core.document,
        errors: allErrors,
      };
    },
  );
}

/**
 * Best-effort variant of `parseSCXML`. Always returns a `data` tree (a
 * minimal fallback document when the input is too malformed to parse), so a
 * consumer (e.g. an editor) always has something to render while typing.
 * `recoverable` is `false` when the returned tree is a degraded fallback.
 *
 * @param xmlString - Raw SCXML XML content (may be transiently malformed).
 * @param options - Optional parse options (e.g. captureStringPositions).
 * @returns A PartialParseResult with an always-defined data tree.
 */
export function parseSCXMLPartial(
  xmlString: string,
  options: ParseOptions = {},
): PartialParseResult {
  return parserTracer.withSpan(
    'parser.parseSCXMLPartial',
    { 'scxml.input.length': xmlString.length },
    () => {
      const core = parseCore(xmlString, options);
      const document = core.document ?? createEmptyDocument();
      const allErrors = [...core.diagnostics, ...parserDiagnostics];
      return {
        data: document,
        errors: allErrors,
        recoverable: core.document !== undefined,
      };
    },
  );
}

/**
 * A minimal, always-safe empty SCXML document used as the fallback tree when
 * input cannot be parsed at all (so `parseSCXMLPartial.data` is never
 * undefined).
 */
function createEmptyDocument(): SCXMLDocument {
  return {
    scxml: {
      version: '1.0',
      states: [],
      parallels: [],
      finals: [],
      scripts: [],
      metadata: [],
    },
  };
}

/**
 * Shared parse pipeline. Runs the single normalization path and reports
 * which stage failed. The strict (`parseSCXML`) and best-effort
 * (`parseSCXMLPartial`) entry points both wrap this; the strict wrapper drops
 * `document` on failure while the best-effort wrapper substitutes a fallback.
 */
function parseCore(
  xmlString: string,
  options: ParseOptions,
): {
  document?: SCXMLDocument;
  diagnostics: ValidationDiagnostic[];
} {
  const diagnostics: ValidationDiagnostic[] = [];
  parserDiagnostics = [];
  parserTransitionKeyCounts = new Map<string, number>();
  parserRangeMap = options.captureStringPositions === true ? scanElementRanges(xmlString) : null;

  if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    diagnostics.push({
      message: 'Empty or missing XML content',
      severity: 'error',
      code: 'ERR_XML_SYNTAX',
    });
    return { document: undefined, diagnostics };
  }

  // Validate XML well-formedness first.
  const validationResult: true | XMLErrorLike = XMLValidator.validate(xmlString);
  if (validationResult !== true) {
    diagnostics.push({
      message: validationResult.err.msg,
      severity: 'error',
      code: 'ERR_XML_SYNTAX',
      line: validationResult.err.line,
      column: validationResult.err.col,
    });
    return { document: undefined, diagnostics };
  }

  const parser = new XMLParser(PARSER_CONFIG);
  const parsed: RawRecord = parser.parse(xmlString) as unknown as RawRecord;

  if (!parsed || parsed.scxml === undefined || parsed.scxml === null) {
    diagnostics.push({
      message: 'Root element must be <scxml>',
      severity: 'error',
      code: 'ERR_ROOT_NOT_SCXML',
    });
    return { document: undefined, diagnostics };
  }

  // fast-xml-parser yields an empty string for a bare <scxml/> (no children
  // and no attributes). Normalize that to an empty element.
  const rawScxml =
    typeof parsed.scxml === 'string' ? ({} as RawRecord) : (parsed.scxml as RawRecord);

  const scxml = normalizeSCXMLElement(rawScxml, 'scxml');
  const document: SCXMLDocument = { scxml };

  // Structural sanity check (non-fatal).
  if (
    !scxml.name &&
    !scxml.initial &&
    scxml.states.length === 0 &&
    scxml.parallels.length === 0 &&
    scxml.finals.length === 0
  ) {
    diagnostics.push({
      message:
        'SCXML should have either a name attribute, an initial attribute, or at least one state',
      severity: 'warning',
      code: 'WARN_EMPTY_STATE_MACHINE',
    });
  }

  return { document, diagnostics };
}

/**
 * Attaches the source range for an AST node when captureStringPositions is
 * on. No-op otherwise, keeping the default pipeline free of range bookkeeping.
 */
function attachRange(node: { scxmlStringRange?: ScxmlStringRange }, path: string): void {
  if (!parserRangeMap) {
    return;
  }
  const range = parserRangeMap.get(path);
  if (range) {
    node.scxmlStringRange = range;
  }
}

/**
 * Normalizes a raw root <scxml> record into the SCXML AST root shape.
 */
function normalizeSCXMLElement(raw: RawRecord, path: string): SCXMLElement {
  const element: SCXMLElement = {
    name: readAttr(raw, 'name'),
    xmlns: readAttr(raw, 'xmlns'),
    version: readAttr(raw, 'version'),
    datamodel: readAttr(raw, 'datamodel'),
    binding: readAttr(raw, 'binding') as 'early' | 'late' | undefined,
    initial: readAttr(raw, 'initial'),
    states: [],
    parallels: [],
    finals: [],
    scripts: [],
    datamodelChildren: undefined,
    metadata: [],
  };
  attachRange(element, path);

  element.states = readChildArray(raw, 'state').map((t, i) =>
    normalizeStateNode(t as RawRecord, `${path}/state/${i}`),
  );
  element.parallels = readChildArray(raw, 'parallel').map((t, i) =>
    normalizeParallelNode(t as RawRecord, `${path}/parallel/${i}`),
  );
  element.finals = readChildArray(raw, 'final').map((t, i) =>
    normalizeFinalNode(t as RawRecord, `${path}/final/${i}`),
  );
  element.scripts = readChildArray(raw, 'script').map(normalizeScriptElement);

  const datamodelRaw = raw.datamodel;
  if (datamodelRaw && typeof datamodelRaw === 'object') {
    element.datamodelChildren = extractDataElements(datamodelRaw as RawRecord);
  }

  // Preserve unrecognized extension/namespace blocks as opaque metadata.
  element.metadata = extractMetadataBlocks(raw);

  // Handle the <metadata> element: registered tags -> customChildren,
  // everything else -> opaque metadata blocks.
  applyMetadataToNode(raw, element);

  // Bare registered tags outside <metadata> are reported so the user can fix
  // their placement (they are preserved as opaque metadata, not dropped).
  warnMisplacedCustomTags(raw);

  return element;
}

/**
 * Normalizes a raw <state> record into a StateNode.
 */
function normalizeStateNode(raw: RawRecord, path: string): StateNode {
  const state: StateNode = {
    id: readAttr(raw, 'id') ?? '',
    type: readAttr(raw, 'type') as StateType | undefined,
    initial: readAttr(raw, 'initial'),
    transitions: [],
    states: [],
    parallels: [],
    finals: [],
    history: [],
    invoke: [],
    metadata: [],
  };
  attachRange(state, path);

  state.transitions = readChildArray(raw, 'transition').map((t, i) =>
    normalizeTransition(t as RawRecord, state.id, `${path}/transition/${i}`),
  );
  state.states = readChildArray(raw, 'state').map((t, i) =>
    normalizeStateNode(t as RawRecord, `${path}/state/${i}`),
  );
  state.parallels = readChildArray(raw, 'parallel').map((t, i) =>
    normalizeParallelNode(t as RawRecord, `${path}/parallel/${i}`),
  );
  state.finals = readChildArray(raw, 'final').map((t, i) =>
    normalizeFinalNode(t as RawRecord, `${path}/final/${i}`),
  );
  state.history = readChildArray(raw, 'history').map((t, i) =>
    normalizeHistoryNode(t as RawRecord, `${path}/history/${i}`),
  );
  state.invoke = readChildArray(raw, 'invoke').map(normalizeInvokeElement);

  const initialBlockRaw = raw.initial;
  if (initialBlockRaw && typeof initialBlockRaw === 'object') {
    state.initialBlock = normalizeInitialBlock(
      initialBlockRaw as RawRecord,
      state.id,
      `${path}/initial/0`,
    );
  }

  const onentryRaw = raw.onentry;
  if (onentryRaw) {
    state.onentry = extractExecutableContent(onentryRaw as RawRecord);
  }
  const onexitRaw = raw.onexit;
  if (onexitRaw) {
    state.onexit = extractExecutableContent(onexitRaw as RawRecord);
  }

  const datamodelRaw = raw.datamodel;
  if (datamodelRaw) {
    state.datamodel = extractDataElements(datamodelRaw as RawRecord);
  }

  applyMetadataToNode(raw, state);
  warnMisplacedCustomTags(raw);

  return state;
}

/**
 * Normalizes a raw <parallel> record into a ParallelNode.
 */
function normalizeParallelNode(raw: RawRecord, path: string): ParallelNode {
  const parallel: ParallelNode = {
    id: readAttr(raw, 'id') ?? '',
    transitions: [],
    states: [],
    parallels: [],
    finals: [],
    history: [],
    invoke: [],
    metadata: [],
  };
  attachRange(parallel, path);

  parallel.transitions = readChildArray(raw, 'transition').map((t, i) =>
    normalizeTransition(t as RawRecord, parallel.id, `${path}/transition/${i}`),
  );
  parallel.states = readChildArray(raw, 'state').map((t, i) =>
    normalizeStateNode(t as RawRecord, `${path}/state/${i}`),
  );
  parallel.parallels = readChildArray(raw, 'parallel').map((t, i) =>
    normalizeParallelNode(t as RawRecord, `${path}/parallel/${i}`),
  );
  parallel.finals = readChildArray(raw, 'final').map((t, i) =>
    normalizeFinalNode(t as RawRecord, `${path}/final/${i}`),
  );
  parallel.history = readChildArray(raw, 'history').map((t, i) =>
    normalizeHistoryNode(t as RawRecord, `${path}/history/${i}`),
  );
  parallel.invoke = readChildArray(raw, 'invoke').map(normalizeInvokeElement);

  const initialBlockRaw = raw.initial;
  if (initialBlockRaw && typeof initialBlockRaw === 'object') {
    parallel.initialBlock = normalizeInitialBlock(
      initialBlockRaw as RawRecord,
      parallel.id,
      `${path}/initial/0`,
    );
  }

  const onentryRaw = raw.onentry;
  if (onentryRaw) {
    parallel.onentry = extractExecutableContent(onentryRaw as RawRecord);
  }
  const onexitRaw = raw.onexit;
  if (onexitRaw) {
    parallel.onexit = extractExecutableContent(onexitRaw as RawRecord);
  }

  const datamodelRaw = raw.datamodel;
  if (datamodelRaw) {
    parallel.datamodel = extractDataElements(datamodelRaw as RawRecord);
  }

  applyMetadataToNode(raw, parallel);
  warnMisplacedCustomTags(raw);

  return parallel;
}

/**
 * Normalizes a raw <final> record into a FinalNode.
 */
function normalizeFinalNode(raw: RawRecord, path: string): FinalNode {
  const final: FinalNode = {
    id: readAttr(raw, 'id') ?? '',
    metadata: [],
  };
  attachRange(final, path);

  const onentryRaw = raw.onentry;
  if (onentryRaw) {
    final.onentry = extractExecutableContent(onentryRaw as RawRecord);
  }
  const onexitRaw = raw.onexit;
  if (onexitRaw) {
    final.onexit = extractExecutableContent(onexitRaw as RawRecord);
  }

  const donedataRaw = raw.donedata;
  if (donedataRaw) {
    final.donedata = normalizeDoneData(donedataRaw as RawRecord);
  }

  applyMetadataToNode(raw, final);
  warnMisplacedCustomTags(raw);

  return final;
}

/**
 * Normalizes a raw <history> record into a HistoryNode.
 */
function normalizeHistoryNode(raw: RawRecord, path: string): HistoryNode {
  const history: HistoryNode = {
    id: readAttr(raw, 'id') ?? '',
    type: (readAttr(raw, 'type') as 'shallow' | 'deep' | undefined) ?? 'shallow',
  };
  attachRange(history, path);

  const transitionRaw = raw.transition;
  if (transitionRaw) {
    history.transition = normalizeTransition(
      transitionRaw as RawRecord,
      history.id,
      `${path}/transition`,
    );
  }

  return history;
}

/**
 * Normalizes a raw <initial> record into an InitialBlock. `source` is the id
 * of the owning state/parallel, used to derive deterministic transition ids.
 */
function normalizeInitialBlock(raw: RawRecord, source: string, path: string): InitialBlock {
  const block: InitialBlock = {};
  attachRange(block, path);
  const transitionRaw = raw.transition;
  if (transitionRaw) {
    block.transition = readChildArray(raw, 'transition').map((t, i) =>
      normalizeTransition(t as RawRecord, source, `${path}/transition/${i}`),
    );
  }
  const nestedRaw = raw.initial;
  if (nestedRaw) {
    const nested = Array.isArray(nestedRaw) ? nestedRaw : [nestedRaw];
    block.blocks = nested.map((b, i) =>
      normalizeInitialBlock(b as RawRecord, source, `${path}/initial/${i}`),
    );
  }
  return block;
}

/**
 * Normalizes a raw <transition> record into a Transition. `source` is the id
 * of the owning element (state/parallel/history, or the enclosing state for
 * <initial>), used to derive a stable deterministic id when no explicit
 * `<transitionId>` is present.
 */
function normalizeTransition(raw: RawRecord, source: string, path: string): Transition {
  const transition: Transition = {
    event: readAttr(raw, 'event'),
    cond: readAttr(raw, 'cond'),
    target: readAttr(raw, 'target'),
    type: readAttr(raw, 'type') as 'internal' | 'external' | undefined,
    executable: [],
    metadata: [],
  };
  attachRange(transition, path);

  transition.executable = extractTransitionExecutable(raw);
  applyMetadataToNode(raw, transition);

  const explicitId = readTransitionId(transition.metadata);
  if (explicitId !== undefined) {
    transition.id = explicitId;
  } else {
    assignDerivedTransitionId(transition, source);
  }

  warnMisplacedCustomTags(raw);
  return transition;
}

/**
 * Reads an explicit transition id from its `transitionId` metadata block
 * (attribute form `id` or `value`).
 */
function readTransitionId(metadata: MetadataBlock[]): string | undefined {
  const block = metadata.find((b) => b.tag === 'transitionId');
  if (!block) {
    return undefined;
  }
  const explicit = block.attributes.id ?? block.attributes.value;
  if (explicit !== undefined) {
    return String(explicit);
  }
  const text = block.text;
  return text !== undefined ? String(text).trim() || undefined : undefined;
}

/**
 * Derives a stable deterministic id for a transition that has no explicit
 * id, and persists it as a `transitionId` metadata block so it survives
 * round-trips. Deduplicates transitions between the same `source:target`
 * pair with `_1`, `_2`, ... suffixes.
 */
function assignDerivedTransitionId(transition: Transition, source: string): void {
  const target = transition.target ?? 'self';
  const base = `${source}:${target}`;
  const count = parserTransitionKeyCounts.get(base) ?? 0;
  parserTransitionKeyCounts.set(base, count + 1);
  const id = count === 0 ? base : `${base}_${count}`;
  transition.id = id;
  // Persist the derived id so it stays stable across parse -> serialize -> parse.
  transition.metadata.push({ tag: 'transitionId', attributes: {}, text: id });
}

/**
 * Extracts <metadata> children from a raw element and attaches them to the
 * given parent AST node. Registered custom tags are parsed into
 * `customChildren`; every other metadata child is preserved verbatim as an
 * opaque `MetadataBlock` (and reported to the user so they know it is not
 * interpreted).
 */
function extractMetadataAndCustom(
  raw: RawRecord,
  parent: CustomTagParseContext['parentASTNode'],
): { metadata: MetadataBlock[]; customChildren: CustomASTNode[] } {
  const metadata: MetadataBlock[] = [];
  const customChildren: CustomASTNode[] = [];
  const registry = TagRegistry.getInstance();
  const metadataRows = readChildArray(raw, 'metadata');
  for (const meta of metadataRows) {
    if (typeof meta !== 'object' || meta === null) {
      continue;
    }
    for (const key of Object.keys(meta)) {
      if (key.startsWith(ATTR_PREFIX) || key === TEXT_KEY) {
        continue;
      }
      const values = readChildArray(meta, key);
      for (const value of values) {
        if (registry.has(key)) {
          customChildren.push(buildCustomASTNode(key, value as RawRecord, parent));
        } else {
          metadata.push(toMetadataBlock(key, value as RawRecord));
          parserDiagnostics.push({
            severity: 'warning',
            code: 'WARN_UNREGISTERED_METADATA_TAG',
            message: `<${key}> inside <metadata> is not a registered custom tag; it will be preserved as opaque metadata but not interpreted.`,
          });
        }
      }
    }
  }
  return { metadata, customChildren };
}

/**
 * Wraps a raw child element as an opaque MetadataBlock (tag + attributes +
 * text), preserving it verbatim for lossless round-tripping.
 */
function toMetadataBlock(tag: string, record: RawRecord): MetadataBlock {
  // A leaf whose content is plain text (no attributes) is produced by
  // fast-xml-parser as a string or number rather than an object. Treat the
  // whole value as the block's text content.
  if (typeof record !== 'object' || record === null) {
    return {
      tag,
      attributes: {},
      text: typeof record === 'number' ? record : String(record),
    };
  }
  const attributes: Record<string, string> = {};
  for (const attrKey of Object.keys(record)) {
    if (attrKey.startsWith(ATTR_PREFIX)) {
      attributes[attrKey.slice(2)] = String(record[attrKey]);
    }
  }
  const text = record[TEXT_KEY];
  return {
    tag,
    attributes,
    text:
      text !== undefined && text !== null
        ? typeof text === 'number'
          ? text
          : String(text)
        : undefined,
  };
}

/**
 * Assigns `metadata` / `customChildren` on a node from its <metadata> block,
 * merging with any blocks already recorded on the node (e.g. bare unknown
 * root-level elements captured by `extractMetadataBlocks`).
 */
function applyMetadataToNode(
  raw: RawRecord,
  node: { metadata: MetadataBlock[]; customChildren?: CustomASTNode[] },
): void {
  const extracted = extractMetadataAndCustom(raw, node as CustomTagParseContext['parentASTNode']);
  if (extracted.metadata.length > 0) {
    node.metadata.push(...extracted.metadata);
  }
  if (extracted.customChildren.length > 0) {
    node.customChildren = extracted.customChildren;
  }
}

/**
 * Warns when a registered custom tag appears as a bare direct child (outside
 * `<metadata>`). Per the metadata-only convention, custom tags must live
 * inside a `<metadata>` block to be honored.
 */
function warnMisplacedCustomTags(raw: RawRecord): void {
  const registry = TagRegistry.getInstance();
  for (const key of Object.keys(raw)) {
    if (key.startsWith(ATTR_PREFIX) || key === TEXT_KEY || key === 'metadata') {
      continue;
    }
    if (registry.has(key)) {
      parserDiagnostics.push({
        severity: 'warning',
        code: 'WARN_CUSTOM_TAG_OUTSIDE_METADATA',
        message: `<${key}> is a registered custom tag but must be nested inside a <metadata> block to be honored.`,
      });
    }
  }
}

/**
 * Builds a CustomASTNode for a registered tag, delegating to its `parse`
 * hook. Returns undefined when the tag is not registered.
 */
function buildCustomASTNode(
  tagName: string,
  raw: RawRecord,
  parentASTNode: CustomTagParseContext['parentASTNode'],
): CustomASTNode {
  const registry = TagRegistry.getInstance();
  const spec = registry.get(tagName)!;
  const attributes: Record<string, string> = {};
  for (const attrKey of Object.keys(raw)) {
    if (attrKey.startsWith(ATTR_PREFIX)) {
      attributes[attrKey.slice(2)] = String(raw[attrKey]);
    }
  }
  const text = raw[TEXT_KEY];
  const ctx: CustomTagParseContext = {
    tagName: tagName.toLowerCase(),
    attributes,
    children: Object.keys(raw)
      .filter((k) => !k.startsWith(ATTR_PREFIX) && k !== TEXT_KEY)
      .flatMap((k) => readChildArray(raw, k)),
    textContent: text !== undefined && text !== null ? String(text) : undefined,
    parentASTNode,
  };
  return spec.parse(ctx);
}

/**
 * Extracts executable content from a raw <transition> record, treating any
 * recognized executable child element as executable content.
 */
function extractTransitionExecutable(raw: RawRecord): ExecutableContent[] {
  const executable: ExecutableContent[] = [];
  for (const key of Object.keys(raw)) {
    if (key.startsWith(ATTR_PREFIX) || key === TEXT_KEY) {
      continue;
    }
    const values = readChildArray(raw, key);
    for (const value of values) {
      const content = normalizeExecutableElement(key, value as RawRecord);
      if (content) {
        executable.push(content);
      }
    }
  }
  return executable;
}

/**
 * Extracts executable content from a raw <onentry>/<onexit> record.
 */
function extractExecutableContent(raw: RawRecord): ExecutableContent[] {
  const executable: ExecutableContent[] = [];
  for (const key of Object.keys(raw)) {
    const values = readChildArray(raw, key);
    for (const value of values) {
      const content = normalizeExecutableElement(key, value as RawRecord);
      if (content) {
        executable.push(content);
      }
    }
  }
  return executable;
}

/**
 * Normalizes a single executable child element by its tag name, or returns
 * null when the tag is not a recognized executable element.
 */
function normalizeExecutableElement(tag: string, raw: RawRecord): ExecutableContent | null {
  switch (tag) {
    case 'raise':
      return { kind: 'raise', event: readAttr(raw, 'event') ?? '' };
    case 'if':
      return {
        kind: 'if',
        cond: readAttr(raw, 'cond') ?? '',
        executable: extractExecutableContent(raw),
      };
    case 'elseif':
      return {
        kind: 'elseif',
        cond: readAttr(raw, 'cond') ?? '',
        executable: extractExecutableContent(raw),
      };
    case 'else':
      return { kind: 'else', executable: extractExecutableContent(raw) };
    case 'foreach': {
      const foreach: ForEachElement = {
        kind: 'foreach',
        array: readAttr(raw, 'array') ?? '',
        item: readAttr(raw, 'item') ?? '',
        index: readAttr(raw, 'index'),
        executable: extractExecutableContent(raw),
      };
      return foreach;
    }
    case 'log':
      return {
        kind: 'log',
        label: readAttr(raw, 'label'),
        expr: readAttr(raw, 'expr'),
      };
    case 'assign':
      return {
        kind: 'assign',
        location: readAttr(raw, 'location') ?? '',
        expr: readAttr(raw, 'expr'),
      };
    case 'send': {
      const send: SendElement = {
        kind: 'send',
        event: readAttr(raw, 'event'),
        eventexpr: readAttr(raw, 'eventexpr'),
        target: readAttr(raw, 'target'),
        targetexpr: readAttr(raw, 'targetexpr'),
        type: readAttr(raw, 'type'),
        typeexpr: readAttr(raw, 'typeexpr'),
        id: readAttr(raw, 'id'),
        idlocation: readAttr(raw, 'idlocation'),
        delay: readAttr(raw, 'delay'),
        delayexpr: readAttr(raw, 'delayexpr'),
        namelist: readAttr(raw, 'namelist'),
      };
      const paramRaw = raw.param;
      if (paramRaw) {
        send.param = readChildArray(raw, 'param').map(normalizeParam);
      }
      const contentRaw = raw.content;
      if (contentRaw) {
        send.content = normalizeContent(contentRaw as RawRecord);
      }
      return send;
    }
    case 'cancel':
      return {
        kind: 'cancel',
        sendid: readAttr(raw, 'sendid'),
        sendidexpr: readAttr(raw, 'sendidexpr'),
      };
    case 'script':
      return normalizeScriptElement(raw);
    default:
      return null;
  }
}

/**
 * Normalizes a raw <script> record into a ScriptElement.
 */
function normalizeScriptElement(raw: RawRecord | string): ScriptElement {
  // fast-xml-parser yields a plain string when a <script> has only text
  // content and no attributes.
  if (typeof raw === 'string') {
    return { text: raw };
  }
  const script: ScriptElement = {
    src: readAttr(raw, 'src'),
  };
  const text = raw[TEXT_KEY];
  if (text !== undefined) {
    script.text = String(text);
  }
  return script;
}

/**
 * Normalizes a raw <donedata> record into a DoneDataElement.
 */
function normalizeDoneData(raw: RawRecord): DoneDataElement {
  const donedata: DoneDataElement = {};
  const contentRaw = raw.content;
  if (contentRaw) {
    donedata.content = normalizeContent(contentRaw as RawRecord);
  }
  const paramRaw = raw.param;
  if (paramRaw) {
    donedata.param = readChildArray(raw, 'param').map(normalizeParam);
  }
  return donedata;
}

/**
 * Normalizes a raw <invoke> record into an InvokeElement.
 */
function normalizeInvokeElement(raw: RawRecord): InvokeElement {
  const invoke: InvokeElement = {
    type: readAttr(raw, 'type'),
    src: readAttr(raw, 'src'),
    id: readAttr(raw, 'id'),
    idlocation: readAttr(raw, 'idlocation'),
    srcexpr: readAttr(raw, 'srcexpr'),
  };

  const autoforward = readAttr(raw, 'autoforward');
  if (autoforward !== undefined) {
    invoke.autoforward = autoforward === 'true' || autoforward === '1';
  }

  const paramRaw = raw.param;
  if (paramRaw) {
    invoke.param = readChildArray(raw, 'param').map(normalizeParam);
  }

  const finalizeRaw = raw.finalize;
  if (finalizeRaw) {
    invoke.finalize = extractExecutableContent(finalizeRaw as RawRecord);
  }

  const contentRaw = raw.content;
  if (contentRaw) {
    invoke.content = normalizeContent(contentRaw as RawRecord);
  }

  return invoke;
}

/**
 * Normalizes a raw <param> record into a ParamElement.
 */
function normalizeParam(raw: RawRecord): ParamElement {
  return {
    name: readAttr(raw, 'name') ?? '',
    expr: readAttr(raw, 'expr'),
    location: readAttr(raw, 'location'),
  };
}

/**
 * Normalizes a raw <content> record into a ContentElement.
 */
function normalizeContent(raw: RawRecord): ContentElement {
  // fast-xml-parser yields a plain string for text-only content.
  if (typeof raw === 'string') {
    return { text: raw };
  }
  const content: ContentElement = {
    expr: readAttr(raw, 'expr'),
  };
  const text = raw[TEXT_KEY];
  if (text !== undefined) {
    content.text = String(text);
  }
  return content;
}

/**
 * Extracts <data> elements from a raw <datamodel> record.
 */
function extractDataElements(raw: RawRecord): DataElement[] {
  return readChildArray(raw, 'data').map((d) => {
    const element: DataElement = {
      id: readAttr(d as RawRecord, 'id') ?? '',
      src: readAttr(d as RawRecord, 'src'),
      expr: readAttr(d as RawRecord, 'expr'),
      confType: readAttr(d as RawRecord, 'confType'),
    };
    const text = (d as RawRecord)[TEXT_KEY];
    if (text !== undefined) {
      element.text = String(text);
    }
    return element;
  });
}

/**
 * Extracts unrecognized / extension / namespace-scoped child elements as
 * metadata blocks so they survive a round-trip.
 */
function extractMetadataBlocks(raw: RawRecord): MetadataBlock[] {
  const metadata: MetadataBlock[] = [];
  for (const key of Object.keys(raw)) {
    if (key.startsWith(ATTR_PREFIX)) {
      continue;
    }
    const knownChildren = [
      'metadata',
      'state',
      'parallel',
      'final',
      'script',
      'datamodel',
      'transition',
      'history',
      'onentry',
      'onexit',
      'invoke',
      'donedata',
      'initial',
    ];
    if (knownChildren.includes(key)) {
      continue;
    }
    // Preserve any other unrecognized / extension / namespace-scoped element
    // (including bare registered tags outside <metadata>) as an opaque block
    // so nothing is lost on round-trip.
    const values = readChildArray(raw, key);
    for (const value of values) {
      metadata.push(toMetadataBlock(key, value as RawRecord));
    }
  }
  return metadata;
}

/**
 * Reads a single attribute value (or its raw value when not a string).
 */
function readAttr(raw: RawRecord, name: string): string | undefined {
  const fullName = ATTR_PREFIX + name;
  const value = raw[fullName];
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

/**
 * Reads a child array from a raw record, handling both single-element and
 * array forms produced by fast-xml-parser. Members are cast to RawRecord;
 * note that some elements (e.g. a bare <script>) may actually be strings and
 * must be guarded at the normalize call site.
 */
function readChildArray(raw: RawRecord, name: string): RawRecord[] {
  const value = raw[name];
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value as RawRecord[];
  }
  return [value as RawRecord];
}
