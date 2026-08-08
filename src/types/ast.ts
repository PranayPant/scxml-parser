/**
 * SCXML Abstract Syntax Tree (AST) node type definitions.
 *
 * These types describe the in-memory representation produced by the parser
 * and consumed by the validator and serializer. They are intentionally
 * UI-agnostic and map 1:1 to the W3C SCXML element vocabulary.
 */
import type { CustomASTNode } from './extensibility';

/**
 * Root of an SCXML document.
 */
export interface SCXMLDocument {
  /** Root <scxml> element. */
  scxml: SCXMLElement;
}

/**
 * SCXML root element.
 */
export interface SCXMLElement {
  /** The state chart name. */
  name?: string;
  /** XML namespace of the document. */
  xmlns?: string;
  /** SCXML specification version. */
  version?: string;
  /** Datamodel binding: 'early' (default) or 'late'. */
  datamodel?: string;
  /** Binding style, kept for round-trip fidelity. */
  binding?: 'early' | 'late';
  /** Identifier of the initial state (space-separated list allowed). */
  initial?: string;
  /** Root-level state nodes. Always an array (empty when none). */
  states: StateNode[];
  /** Root-level parallel nodes. Always an array (empty when none). */
  parallels: ParallelNode[];
  /** Root-level final nodes. Always an array (empty when none). */
  finals: FinalNode[];
  /** Root-level <script> elements. Always an array (empty when none). */
  scripts: ScriptElement[];
  /** Root-level datamodel declaration children. */
  datamodelChildren?: DataElement[];
  /** Raw unrecognized / extension metadata blocks. Always an array. */
  metadata: MetadataBlock[];
  /** Registered custom (non-standard) child tags, when present. */
  customChildren?: CustomASTNode[];
}

/**
 * A metadata / annotation block attached to the document (e.g. a
 * `viz:note` or custom namespace extension). Preserved verbatim so that
 * serialization round-trips without data loss.
 */
export interface MetadataBlock {
  /** Namespace/type tag of the block. */
  tag: string;
  /** Raw attributes (namespace-prefixed keys kept as-is). */
  attributes: Record<string, string>;
  /** Optional text content. */
  text?: string | number;
}

/**
 * Discriminated union of all state-like nodes.
 */
export type StateNodeLike = StateNode | ParallelNode | FinalNode;

/**
 * Standard state node type.
 */
export type StateType = 'compound' | 'atomic' | 'initial';

/**
 * A <state> element.
 */
export interface StateNode {
  /** Unique identifier of the state. */
  id: string;
  /** Optional explicit state type annotation. */
  type?: StateType;
  /** Initial state id (or space-separated list) of this compound state. */
  initial?: string;
  /** Explicit <initial> block with a default transition, when present. */
  initialBlock?: InitialBlock;
  /** Transitions declared on this state. */
  transitions: Transition[];
  /** Nested child states. */
  states: StateNode[];
  /** Nested parallel states. */
  parallels: ParallelNode[];
  /** Nested final states. */
  finals: FinalNode[];
  /** History pseudo-states. */
  history: HistoryNode[];
  /** Child datamodel declarations. */
  datamodel?: DataElement[];
  /** Executable content run on entry. */
  onentry?: ExecutableContent[];
  /** Executable content run on exit. */
  onexit?: ExecutableContent[];
  /** Datamodel invocations. */
  invoke: InvokeElement[];
  /** Raw unrecognized / extension metadata blocks. Always an array. */
  metadata: MetadataBlock[];
  /** Registered custom (non-standard) child tags, when present. */
  customChildren?: CustomASTNode[];
}

/**
 * A <parallel> element.
 */
export interface ParallelNode {
  /** Unique identifier of the parallel state. */
  id: string;
  /** Explicit <initial> block with a default transition, when present. */
  initialBlock?: InitialBlock;
  /** Transitions declared on this parallel state. */
  transitions: Transition[];
  /** Nested child states. */
  states: StateNode[];
  /** Nested parallel states. */
  parallels: ParallelNode[];
  /** Nested final states. */
  finals: FinalNode[];
  /** History pseudo-states. */
  history: HistoryNode[];
  /** Child datamodel declarations. */
  datamodel?: DataElement[];
  /** Executable content run on entry. */
  onentry?: ExecutableContent[];
  /** Executable content run on exit. */
  onexit?: ExecutableContent[];
  /** Datamodel invocations. */
  invoke: InvokeElement[];
  /** Raw unrecognized / extension metadata blocks. Always an array. */
  metadata: MetadataBlock[];
  /** Registered custom (non-standard) child tags, when present. */
  customChildren?: CustomASTNode[];
}

/**
 * A <final> element.
 */
export interface FinalNode {
  /** Unique identifier of the final state. */
  id: string;
  /** Executable content run on entry. */
  onentry?: ExecutableContent[];
  /** Executable content run on exit. */
  onexit?: ExecutableContent[];
  /** Done-data payload. */
  donedata?: DoneDataElement;
  /** Raw unrecognized / extension metadata blocks. Always an array. */
  metadata: MetadataBlock[];
  /** Registered custom (non-standard) child tags, when present. */
  customChildren?: CustomASTNode[];
}

/**
 * A <history> pseudo-state.
 */
export interface HistoryNode {
  /** Unique identifier of the history state. */
  id: string;
  /** 'shallow' (default) or 'deep'. */
  type?: 'shallow' | 'deep';
  /** Optional default transition. */
  transition?: Transition;
}

/**
 * A <transition> element.
 */
export interface Transition {
  /** Event trigger (space/comma separated event names, or '*' / absent). */
  event?: string;
  /** Condition expression guard. */
  cond?: string;
  /** Target state id(s), space-separated. */
  target?: string;
  /** 'internal' or 'external' (default external). */
  type?: 'internal' | 'external';
  /** Executable content run when the transition fires. */
  executable: ExecutableContent[];
  /** Raw unrecognized / extension metadata blocks. Always an array. */
  metadata: MetadataBlock[];
  /** Registered custom (non-standard) child tags, when present. */
  customChildren?: CustomASTNode[];
}

/**
 * A <data> element within a datamodel.
 */
export interface DataElement {
  /** Unique identifier of the data variable. */
  id: string;
  /** Source URI for the data. */
  src?: string;
  /** Inline expression / value. */
  expr?: string;
  /** Legacy content type annotation. */
  confType?: string;
  /** Raw text content. */
  text?: string;
}

/**
 * An explicit <initial> block containing a default transition.
 */
export interface InitialBlock {
  /** Default transitions taken upon entering the compound state. */
  transition?: Transition[];
  /** Nested initial blocks (rare). */
  blocks?: InitialBlock[];
}

/**
 * An <invoke> element.
 */
export interface InvokeElement {
  /** Invocation type. */
  type?: string;
  /** Source URI of the invoked service. */
  src?: string;
  /** Invocation identifier. */
  id?: string;
  /** Location of the invocation identifier. */
  idlocation?: string;
  /** Expression computing the source. */
  srcexpr?: string;
  /** Whether events are forwarded automatically. */
  autoforward?: boolean;
  /** Parameters passed to the invoked service. */
  param?: ParamElement[];
  /** Executable content run when the invoked service finalizes. */
  finalize?: ExecutableContent[];
  /** Inline content. */
  content?: ContentElement;
}

/**
 * A <param> element.
 */
export interface ParamElement {
  /** Parameter name. */
  name: string;
  /** Expression computing the parameter value. */
  expr?: string;
  /** Location expression assigning the value. */
  location?: string;
}

/**
 * A <content> element.
 */
export interface ContentElement {
  /** Expression, when content is computed. */
  expr?: string;
  /** Inline text content. */
  text?: string;
}

/**
 * A <donedata> element.
 */
export interface DoneDataElement {
  /** Inline content payload. */
  content?: ContentElement;
  /** Parameters included in done data. */
  param?: ParamElement[];
}

/**
 * A <script> element.
 */
export interface ScriptElement {
  /** Source URI of the script. */
  src?: string;
  /** Inline script text. */
  text?: string;
}

/**
 * Executable content: the union of all executable children elements
 * (`raise`, `if`, `elseif`, `else`, `foreach`, `log`, `assign`, `send`,
 * `cancel`, `script`) that can appear inside `<onentry>`, `<onexit>` or a
 * `<transition>`.
 */
export type ExecutableContent =
  | RaiseElement
  | IfElement
  | ElseIfElement
  | ElseElement
  | ForEachElement
  | LogElement
  | AssignElement
  | SendElement
  | CancelElement
  | ScriptElement;

/**
 * A <raise> element.
 */
export interface RaiseElement {
  kind: 'raise';
  event: string;
}

/**
 * An <if> element.
 */
export interface IfElement {
  kind: 'if';
  cond: string;
  executable: ExecutableContent[];
}

/**
 * An <elseif> element.
 */
export interface ElseIfElement {
  kind: 'elseif';
  cond: string;
  executable: ExecutableContent[];
}

/**
 * An <else> element.
 */
export interface ElseElement {
  kind: 'else';
  executable: ExecutableContent[];
}

/**
 * A <foreach> element.
 */
export interface ForEachElement {
  kind: 'foreach';
  array: string;
  item: string;
  index?: string;
  executable: ExecutableContent[];
}

/**
 * A <log> element.
 */
export interface LogElement {
  kind: 'log';
  label?: string;
  expr?: string;
}

/**
 * An <assign> element.
 */
export interface AssignElement {
  kind: 'assign';
  location: string;
  expr?: string;
}

/**
 * A <send> element.
 */
export interface SendElement {
  kind: 'send';
  event?: string;
  eventexpr?: string;
  target?: string;
  targetexpr?: string;
  type?: string;
  typeexpr?: string;
  id?: string;
  idlocation?: string;
  delay?: string;
  delayexpr?: string;
  namelist?: string;
  param?: ParamElement[];
  content?: ContentElement;
}

/**
 * A <cancel> element.
 */
export interface CancelElement {
  kind: 'cancel';
  sendid?: string;
  sendidexpr?: string;
}
