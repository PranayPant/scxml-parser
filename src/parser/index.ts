/**
 * Raw XML -> SCXML AST conversion.
 *
 * Uses `fast-xml-parser` to turn raw XML text into a lightweight object
 * tree, then normalizes that tree into the engine's SCXML AST. This layer
 * is fully UI-agnostic — it never touches the DOM, Monaco, or any store.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { TagRegistry } from '../registry/TagRegistry';
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
  SendElement,
  StateNode,
  StateType,
  Transition,
} from '../types/ast';
import type { ParseResult, ValidationDiagnostic } from '../types/diagnostics';
import type { CustomASTNode, CustomTagParseContext } from '../types/extensibility';

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
 * Parses a raw SCXML string into an in-memory AST.
 *
 * @param xmlString - Raw SCXML XML content (or any well-formed XML).
 * @returns A ParseResult containing the AST on success and diagnostics.
 */
export function parseSCXML(xmlString: string): ParseResult {
  const diagnostics: ValidationDiagnostic[] = [];

  if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    diagnostics.push({
      message: 'Empty or missing XML content',
      severity: 'error',
      code: 'ERR_XML_SYNTAX',
    });
    return { success: false, errors: diagnostics };
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
    return { success: false, errors: diagnostics };
  }

  const parser = new XMLParser(PARSER_CONFIG);
  const parsed: RawRecord = parser.parse(xmlString) as unknown as RawRecord;

  if (!parsed || parsed.scxml === undefined || parsed.scxml === null) {
    diagnostics.push({
      message: 'Root element must be <scxml>',
      severity: 'error',
      code: 'ERR_ROOT_NOT_SCXML',
    });
    return { success: false, errors: diagnostics };
  }

  // fast-xml-parser yields an empty string for a bare <scxml/> (no children
  // and no attributes). Normalize that to an empty element.
  const rawScxml =
    typeof parsed.scxml === 'string' ? ({} as RawRecord) : (parsed.scxml as RawRecord);

  const scxml = normalizeSCXMLElement(rawScxml);
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

  return {
    success: diagnostics.every((d) => d.severity !== 'error'),
    data: document,
    errors: diagnostics,
  };
}

/**
 * Normalizes a raw root <scxml> record into the SCXML AST root shape.
 */
function normalizeSCXMLElement(raw: RawRecord): SCXMLElement {
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

  element.states = readChildArray(raw, 'state').map(normalizeStateNode);
  element.parallels = readChildArray(raw, 'parallel').map(normalizeParallelNode);
  element.finals = readChildArray(raw, 'final').map(normalizeFinalNode);
  element.scripts = readChildArray(raw, 'script').map(normalizeScriptElement);

  const datamodelRaw = raw.datamodel;
  if (datamodelRaw && typeof datamodelRaw === 'object') {
    element.datamodelChildren = extractDataElements(datamodelRaw as RawRecord);
  }

  // Preserve unrecognized namespace/extension blocks as metadata.
  element.metadata = extractMetadataBlocks(raw);

  // Registered custom tags are routed to customChildren instead of metadata.
  const customChildren = extractCustomChildren(raw, element);
  if (customChildren.length > 0) {
    element.customChildren = customChildren;
  }

  return element;
}

/**
 * Normalizes a raw <state> record into a StateNode.
 */
function normalizeStateNode(raw: RawRecord): StateNode {
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
  };

  state.transitions = readChildArray(raw, 'transition').map(normalizeTransition);
  state.states = readChildArray(raw, 'state').map(normalizeStateNode);
  state.parallels = readChildArray(raw, 'parallel').map(normalizeParallelNode);
  state.finals = readChildArray(raw, 'final').map(normalizeFinalNode);
  state.history = readChildArray(raw, 'history').map(normalizeHistoryNode);
  state.invoke = readChildArray(raw, 'invoke').map(normalizeInvokeElement);

  const initialBlockRaw = raw.initial;
  if (initialBlockRaw && typeof initialBlockRaw === 'object') {
    state.initialBlock = normalizeInitialBlock(initialBlockRaw as RawRecord);
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

  const customChildren = extractCustomChildren(raw, state);
  if (customChildren.length > 0) {
    state.customChildren = customChildren;
  }

  return state;
}

/**
 * Normalizes a raw <parallel> record into a ParallelNode.
 */
function normalizeParallelNode(raw: RawRecord): ParallelNode {
  const parallel: ParallelNode = {
    id: readAttr(raw, 'id') ?? '',
    transitions: [],
    states: [],
    parallels: [],
    finals: [],
    history: [],
    invoke: [],
  };

  parallel.transitions = readChildArray(raw, 'transition').map(normalizeTransition);
  parallel.states = readChildArray(raw, 'state').map(normalizeStateNode);
  parallel.parallels = readChildArray(raw, 'parallel').map(normalizeParallelNode);
  parallel.finals = readChildArray(raw, 'final').map(normalizeFinalNode);
  parallel.history = readChildArray(raw, 'history').map(normalizeHistoryNode);
  parallel.invoke = readChildArray(raw, 'invoke').map(normalizeInvokeElement);

  const initialBlockRaw = raw.initial;
  if (initialBlockRaw && typeof initialBlockRaw === 'object') {
    parallel.initialBlock = normalizeInitialBlock(initialBlockRaw as RawRecord);
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

  const customChildren = extractCustomChildren(raw, parallel);
  if (customChildren.length > 0) {
    parallel.customChildren = customChildren;
  }

  return parallel;
}

/**
 * Normalizes a raw <final> record into a FinalNode.
 */
function normalizeFinalNode(raw: RawRecord): FinalNode {
  const final: FinalNode = {
    id: readAttr(raw, 'id') ?? '',
  };

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

  return final;
}

/**
 * Normalizes a raw <history> record into a HistoryNode.
 */
function normalizeHistoryNode(raw: RawRecord): HistoryNode {
  const history: HistoryNode = {
    id: readAttr(raw, 'id') ?? '',
    type: (readAttr(raw, 'type') as 'shallow' | 'deep' | undefined) ?? 'shallow',
  };

  const transitionRaw = raw.transition;
  if (transitionRaw) {
    history.transition = normalizeTransition(transitionRaw as RawRecord);
  }

  return history;
}

/**
 * Normalizes a raw <initial> record into an InitialBlock.
 */
function normalizeInitialBlock(raw: RawRecord): InitialBlock {
  const block: InitialBlock = {};
  const transitionRaw = raw.transition;
  if (transitionRaw) {
    block.transition = readChildArray(raw, 'transition').map(normalizeTransition);
  }
  const nestedRaw = raw.initial;
  if (nestedRaw) {
    const nested = Array.isArray(nestedRaw) ? nestedRaw : [nestedRaw];
    block.blocks = nested.map((b) => normalizeInitialBlock(b as RawRecord));
  }
  return block;
}

/**
 * Normalizes a raw <transition> record into a Transition.
 */
function normalizeTransition(raw: RawRecord): Transition {
  const transition: Transition = {
    event: readAttr(raw, 'event'),
    cond: readAttr(raw, 'cond'),
    target: readAttr(raw, 'target'),
    type: readAttr(raw, 'type') as 'internal' | 'external' | undefined,
    executable: [],
  };

  transition.executable = extractTransitionExecutable(raw);
  const customChildren = extractCustomChildren(raw, transition);
  if (customChildren.length > 0) {
    transition.customChildren = customChildren;
  }
  return transition;
}

/**
 * Extracts registered custom-tag children from a raw element and attaches
 * them to the given parent AST node. Unknown tags that are not registered
 * are skipped (they are ignored or preserved as metadata elsewhere).
 */
function extractCustomChildren(
  raw: RawRecord,
  parent: CustomTagParseContext['parentASTNode'],
): CustomASTNode[] {
  const customChildren: CustomASTNode[] = [];
  for (const key of Object.keys(raw)) {
    if (key.startsWith(ATTR_PREFIX) || key === TEXT_KEY) {
      continue;
    }
    const values = readChildArray(raw, key);
    for (const value of values) {
      const node = buildCustomASTNode(key, value as RawRecord, parent);
      if (node) {
        customChildren.push(node);
      }
    }
  }
  return customChildren;
}

/**
 * Builds a CustomASTNode for a registered tag, delegating to its `parse`
 * hook. Returns undefined when the tag is not registered.
 */
function buildCustomASTNode(
  tagName: string,
  raw: RawRecord,
  parentASTNode: CustomTagParseContext['parentASTNode'],
): CustomASTNode | undefined {
  const registry = TagRegistry.getInstance();
  if (!registry.has(tagName)) {
    return undefined;
  }
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
    // Registered custom tags are handled as customChildren, not metadata.
    if (TagRegistry.getInstance().has(key)) {
      continue;
    }
    const values = readChildArray(raw, key);
    for (const value of values) {
      const record = value as RawRecord;
      const attributes: Record<string, string> = {};
      for (const attrKey of Object.keys(record)) {
        if (attrKey.startsWith(ATTR_PREFIX)) {
          attributes[attrKey.slice(2)] = String(record[attrKey]);
        }
      }
      const text = record[TEXT_KEY];
      metadata.push({
        tag: key,
        attributes,
        text:
          text !== undefined && text !== null
            ? typeof text === 'number'
              ? text
              : String(text)
            : undefined,
      });
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
