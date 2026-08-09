# scxml-parser — API Reference

This document is the complete, end-to-end reference for the public API of
`scxml-parser`. It describes **everything a consumer can do** with the library:

- Every exported function, class, and type.
- The full in-memory AST shape.
- Every option for each operation.
- Every diagnostic code (validation + parser warnings).
- The custom-tag extension contract.

The library is **UI-agnostic** and headless: it parses, validates,
serializes, prints, and renders SCXML statecharts without any dependency on a
specific rendering framework. It targets Node.js, browsers, CLIs, and editor
hosts.

> **Authoritative source.** The TypeScript declarations emitted to
> `dist/*.d.ts` are the single source of truth. This document mirrors them
> for human-facing discovery; if you need the exact signatures, read the
> `.d.ts` files (or hover any symbol in an editor) — they cannot drift.

---

## 1. Package entry points

```ts
import {
  SCXMLEngine,
  parseSCXML,
  parseSCXMLPartial,
  validateAST,
  serializeSCXML,
  printAST,
  toMermaid,
  walkStates,
  walkTransitions,
  TagRegistry,
  renameState,
  removeState,
  addState,
  addTransition,
  removeTransition,
} from "scxml-parser";
import type {
  SCXMLDocument,
  ParseResult,
  PartialParseResult,
  ParseOptions,
  ValidationDiagnostic,
  SerializationOptions,
  PrintASTOptions,
  Position,
  ScxmlStringRange,
} from "scxml-parser";
```

`scxml-parser` ships **dual module** output:

| Artifact         | Format   | Use                              |
| ---------------- | -------- | -------------------------------- |
| `dist/index.js`  | CommonJS | `require("scxml-parser")`        |
| `dist/index.mjs` | ESM      | `import ... from "scxml-parser"` |
| `dist/*.d.ts`    | Types    | IntelliSense / type checking     |

---

## 2. Top-level functions

All pipeline functions accept and return plain, serializable data — there are
no hidden globals and no required lifecycle setup.

### `parseSCXML(xml: string, options?: ParseOptions): ParseResult`

Parses a raw SCXML XML string into an in-memory AST.

- **Input** — a well-formed SCXML (or any well-formed XML) string. Empty or
  whitespace-only input is rejected with an `ERR_XML_SYNTAX` error.
- **Returns** — a `ParseResult` (see below). On failure, `data` is `undefined`
  and `errors` contains at least one `error`-severity diagnostic.
- **Options** — pass `{ captureStringPositions: true }` to record each node's
  `scxmlStringRange` (source span) in the raw string; see §5 and §9.

```ts
const result = parseSCXML(rawXml);
if (!result.success) {
  console.error(result.errors);
} else {
  const ast = result.data; // SCXMLDocument
}
```

### `parseSCXMLPartial(xml: string, options?: ParseOptions): PartialParseResult`

Best-effort parse for live editing loops. Unlike `parseSCXML`, `data` is
**always** populated with an `SCXMLDocument` — a minimal fallback tree when the
input is too malformed to parse — so an editor always has something to render
while typing. Use `recoverable` to know whether the returned tree is
trustworthy:

```ts
const result = parseSCXMLPartial(editor.getValue());
if (result.recoverable) {
  reRenderCanvas(result.data); // full, trustworthy tree
} else {
  // keep the previous good canvas; result.data is a degraded fallback
}
```

- `recoverable: true` — the input fully parsed into a real AST.
- `recoverable: false` — the input was malformed; `data` is a fallback
  (empty) document and `errors` explains why.

### `validateAST(doc: SCXMLDocument): ValidationDiagnostic[]`

Runs structural and semantic validation over an in-memory AST.

- **Input** — an `SCXMLDocument` (typically the output of `parseSCXML`, or a
  hand-built/modified AST).
- **Returns** — an array of `ValidationDiagnostic` (empty when the document is
  fully valid). Diagnostics carry a stable `code`, a `severity`, and may carry
  source `line`/`column` info **and** a `nodeId`/`transitionId` when the
  offending node or edge is known (see §4). See §6 for the full code catalog.

### `serializeSCXML(doc: SCXMLDocument, options?: SerializationOptions): string`

Serializes an AST back to formatted SCXML XML.

- Lossless round-trip: `parse -> serialize -> parse` preserves all standard
  content **and** opaque metadata and registered custom tags.
- You may **mutate the AST** (add states, transitions, datamodel rules, custom
  children, set `transition.id`, etc.) and re-serialize — the serializer walks
  the same object tree.

### `printAST(doc: SCXMLDocument, options?: PrintASTOptions): string`

Renders an ASCII visual tree of the AST for debugging. Shows the state
hierarchy (states, parallels, finals, history), datamodel, transitions, and
executable content depending on the active options.

### `toMermaid(doc: SCXMLDocument, options?: MermaidOptions): string`

Renders the AST as a [Mermaid](https://mermaid.js.org/) `stateDiagram-v2`
diagram, usable in GitHub, Notion, VS Code, or Mermaid Live Editor.

### `walkStates(doc: SCXMLDocument, visit: (node: StateNodeLike) => void): void`

Visits every **state-like node** (`state`, `parallel`, `final`) in document
order, recursively. Useful for indexing ids / layouts or batching updates in a
single pass without hand-rolling recursion. Does **not** visit transitions.

```ts
const ids: string[] = [];
walkStates(ast, (node) => ids.push(node.id));
```

### `walkTransitions(doc: SCXMLDocument, visit: (transition: Transition, parent: TransitionParent) => void): void`

Visits **every transition** in the document, including:

- transitions declared on `<state>` and `<parallel>` elements,
- `<initial>` (default) transitions — including nested initial blocks,
- `<history>` default transitions.

Each transition is visited with its owning `parent` (`TransitionParent`), so
consumers can build complete edge indexes without walking the tree themselves.

```ts
const edges = new Map<string, Transition>();
walkTransitions(ast, (t) => edges.set(t.id!, t));
```

Because every `Transition` now carries a stable `id` (see §7), edge identity is
reliable even across re-renders.

### AST mutation helpers (Canvas → Code)

In a two-way editor the SCXML string is the source of truth, but visual
actions on the canvas mutate the **in-memory AST** before it is serialized
back to text via `serializeSCXML`. These helpers bundle the cascading,
consistency-preserving updates (rewriting `transition.target` lists,
`initial` attributes, and `<initial>`/`<history>` references) into single,
in-place calls:

```ts
// Rename a state; cascades to every target list, initial ref, and history/etc.
renameState(doc, oldId, newId): void;

// Remove a state and its decorations; prunes dangling transitions
// (see "prune policy" below).
removeState(doc, stateId): void;

// Construct + append a new state under a parent (root when parentId is null).
addState(doc, parentId | null, config: Partial<StateNode> & { id: string }): StateNode;

// Construct + append a well-formed Transition (deterministic id, empty
// executable, default type "external"); returns it for immediate id access.
addTransition(doc, sourceId, targetId, event?, options?): Transition;

// Remove a transition by its stable id across state/initial/history parents.
removeTransition(doc, transitionId): void;
```

All helpers **mutate `doc` in place** and return `void` (or the created node
for the factory functions). They are UI-agnostic and compose with
`serializeSCXML`:

```ts
addTransition(doc, "draft", "review", "SUBMIT"); // canvas edge connect
const nextXml = serializeSCXML(doc); // new source-of-truth string
```

**`removeState` prune policy:** `deletedId` is filtered out of every
space-separated `target`. If a transition's target list becomes empty, it is
**removed** entirely when it carries no standalone meaning (no event, cond, or
executable content); otherwise its `target` is **stripped** so the transition
becomes a targetless internal event handler (preserving `<assign>`/`<send>`
blocks and guarded handlers).

> `reparentState` is intentionally **not** included in v1 — reparenting has
> heavy SCXML validity side effects (transition scoping, initial-state
> invalidation, history targets). Editors can accomplish it via explicit
> `removeState` + `addState`.

---

## 3. `SCXMLEngine` — static facade

`SCXMLEngine` is a convenience static facade standing over the top-level
functions. All methods are `static`; there is nothing to instantiate.

| Method            | Signature                                                                           |
| ----------------- | ----------------------------------------------------------------------------------- |
| `parse`           | `(xml: string, options?: ParseOptions) => ParseResult`                              |
| `parsePartial`    | `(xml: string, options?: ParseOptions) => PartialParseResult`                       |
| `validate`        | `(doc: SCXMLDocument) => ValidationDiagnostic[]`                                    |
| `serialize`       | `(doc: SCXMLDocument, options?: SerializationOptions) => string`                    |
| `print`           | `(doc: SCXMLDocument, options?: PrintASTOptions) => string`                         |
| `toMermaid`       | `(doc: SCXMLDocument, options?: MermaidOptions) => string`                          |
| `registerTag`     | `<T extends CustomASTNode>(spec: CustomTagSpec<T>) => TagRegistry`                  |
| `walkStates`      | `(doc: SCXMLDocument, visit: (node: StateNodeLike) => void) => void`                |
| `walkTransitions` | `(doc: SCXMLDocument, visit: (t: Transition, p: TransitionParent) => void) => void` |

```ts
const ast = SCXMLEngine.parse(xml).data!;
const errors = SCXMLEngine.validate(ast);
const xml2 = SCXMLEngine.serialize(ast, { pretty: true });
SCXMLEngine.registerTag(myTagSpec); // see §8
```

---

## 4. Core result & diagnostic types

### `ParseResult`

```ts
interface ParseResult {
  /** True when parse succeeded without any error-severity diagnostic. */
  success: boolean;
  /** The parsed AST on success; otherwise undefined. */
  data?: SCXMLDocument;
  /** Diagnostics produced during parsing (including warnings). */
  errors: ValidationDiagnostic[];
}
```

### `PartialParseResult`

Returned by `parseSCXMLPartial`. `data` is **always** defined (a fallback
empty document when input is malformed).

```ts
interface PartialParseResult {
  /** The best-effort AST. Always defined. */
  data: SCXMLDocument;
  /** Diagnostics; error-severity entries indicate where recovery occurred. */
  errors: ValidationDiagnostic[];
  /** False when `data` is a degraded fallback because input was malformed. */
  recoverable: boolean;
}
```

### `ValidationDiagnostic`

```ts
interface ValidationDiagnostic {
  /** Human-readable description. */
  message: string;
  /** Stable machine-readable code (see §6). */
  code?: DiagnosticCode;
  /** 'error' | 'warning' | 'info'. */
  severity: DiagnosticSeverity;
  /** 1-based line in the source, when available. */
  line?: number;
  /** 1-based column in the source, when available. */
  column?: number;
  /** Id of the AST node the diagnostic refers to (structural errors), when known. */
  nodeId?: string;
  /** Stable id of the transition the diagnostic refers to, when known. */
  transitionId?: string;
}

type DiagnosticSeverity = "error" | "warning" | "info";
```

`nodeId` / `transitionId` are populated by **structural/semantic validation**
(`validateAST`) so consumers can color-code specific canvas nodes / edges
directly. They are absent on XML syntax diagnostics (which have only line/col).

---

## 5. Options

### `ParseOptions`

| Option                   | Type      | Default | Description                                                                                                                                       |
| ------------------------ | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captureStringPositions` | `boolean` | `false` | Record each AST node's `scxmlStringRange` (its source span in the raw string). Adds a source-scanning pass; intended for editor code↔canvas sync. |

### `SerializationOptions`

| Option              | Type      | Default | Description                                           |
| ------------------- | --------- | ------- | ----------------------------------------------------- |
| `pretty`            | `boolean` | `true`  | Pretty-print (indent) or minify.                      |
| `indent`            | `number`  | `2`     | Spaces per indentation level.                         |
| `escapeText`        | `boolean` | `true`  | Escape reserved XML chars in text/expression content. |
| `includeStateTypes` | `boolean` | `false` | Emit detected `type` annotations on `<state>`.        |

### `PrintASTOptions`

| Option               | Type      | Default | Description                        |
| -------------------- | --------- | ------- | ---------------------------------- |
| `includeMetadata`    | `boolean` | `true`  | Include metadata blocks.           |
| `includeDatamodel`   | `boolean` | `true`  | Include the datamodel section.     |
| `includeTransitions` | `boolean` | `true`  | Include transitions on each state. |
| `includeExecutable`  | `boolean` | `false` | Include executable content detail. |

### `MermaidOptions`

| Option              | Type           | Default | Description                           |
| ------------------- | -------------- | ------- | ------------------------------------- |
| `direction`         | `"LR" \| "TB"` | `"LR"`  | Diagram direction.                    |
| `includeTitle`      | `boolean`      | `true`  | Emit a `title` from the SCXML `name`. |
| `includeEdgeLabels` | `boolean`      | `true`  | Show event/condition on edge labels.  |

---

## 6. Diagnostic codes

### Errors

| Code                             | Meaning                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `ERR_ROOT_NOT_SCXML`             | The root element is not `<scxml>`.                         |
| `ERR_XML_SYNTAX`                 | XML is malformed or cannot be parsed/validated.            |
| `ERR_DUPLICATE_STATE_ID`         | A state id appears more than once.                         |
| `ERR_DUPLICATE_DATA_ID`          | A datamodel variable id is duplicated across scopes.       |
| `ERR_INVALID_TRANSITION_TARGET`  | A transition `target` references a missing state.          |
| `ERR_INVALID_TRANSITION_TYPE`    | `type` is not `internal` or `external`.                    |
| `ERR_INVALID_EVENT_NAME`         | A transition event name is not a valid identifier.         |
| `ERR_INITIAL_STATE_NOT_FOUND`    | An `initial` attribute / `<initial>` target is missing.    |
| `ERR_INVALID_INITIAL_GROUP`      | An `<initial>` group is malformed.                         |
| `ERR_UNREACHABLE_STATE`          | A state is not reachable from the initial configuration.   |
| `ERR_INVALID_CONDITION`          | A condition expression is invalid.                         |
| `ERR_MISSING_REQUIRED_ATTRIBUTE` | A required attribute is absent.                            |
| `ERR_INVALID_ATTRIBUTE_VALUE`    | An attribute value is invalid.                             |
| `ERR_CUSTOM_TAG_INVALID_PARENT`  | A registered custom tag appears under a disallowed parent. |

### Warnings

| Code                               | Meaning                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `WARN_EMPTY_STATE_MACHINE`         | Document defines no name, initial, or states.                                    |
| `WARN_CUSTOM_TAG_OUTSIDE_METADATA` | A registered custom tag appears bare (outside `<metadata>`).                     |
| `WARN_UNREGISTERED_METADATA_TAG`   | A tag inside `<metadata>` is not registered and is preserved as opaque metadata. |

---

## 7. Transition identity & edge keys

Every `Transition` carries a stable `id` for editor edge identity:

- **Explicit id** — a consumer-provided `<transitionId>` metadata element
  (attribute form `id` or `value`, or trimmed text form) sets
  `transition.id`.
- **Deterministic fallback** — when no explicit id is present, the parser
  derives `${source}:${target}` (e.g. `a:b`), appending `_1`, `_2`, … when
  multiple transitions share the same `source:target` pair. The derived id is
  **persisted** as a `transitionId` metadata element so it survives
  round-trips.

```ts
// Example derived ids
//   a --SUBMIT--> b      ->  "a:b"
//   a --CANCEL--> b      ->  "a:b_1"
```

Use `transition.id` (via `walkTransitions`) as the stable key for React Flow
edges, waypoint indexes, and Monaco ↔ canvas cross-highlighting.

---

## 8. Extensibility — custom tags

The library follows the **Open-Closed Principle**: register domain-specific XML
tags (e.g. `<gate>`, `<policy>`, `<rule>`) without modifying the core parser,
validator, or serializer. Custom tags are **scoped to `<metadata>` blocks** so
the emitted SCXML remains standards-valid.

### `TagRegistry`

A registry mapping lowercase tag names to their `CustomTagSpec`. Access the
process-wide singleton via `getInstance()` or construct an isolated instance.

| Member                | Signature                                      | Description                                    |
| --------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `getInstance()`       | `() => TagRegistry`                            | Process-wide singleton registry.               |
| `register(spec)`      | `<T extends CustomASTNode>(spec) => this`      | Register a spec (case-insensitive); chainable. |
| `get(tagName)`        | `(name: string) => CustomTagSpec \| undefined` | Look up a spec.                                |
| `has(tagName)`        | `(name: string) => boolean`                    | Whether a spec is registered.                  |
| `unregister(tagName)` | `(name: string) => boolean`                    | Remove a spec; returns whether removed.        |
| `clear()`             | `() => void`                                   | Remove all specs.                              |
| `size`                | `number` (getter)                              | Count of registered specs.                     |

### `CustomTagSpec<T>`

```ts
interface CustomTagSpec<T extends CustomASTNode = CustomASTNode> {
  /** Exact XML tag name (registered case-insensitively). */
  tagName: string;
  /** Allowed parent contexts by tag name, e.g. ['transition', 'state']. */
  allowedParents?: string[];
  /** Transforms raw XML attributes + children into a typed AST node. */
  parse: (ctx: CustomTagParseContext) => T;
  /** Optional validator returning zero or more diagnostics. */
  validate?: (node: T, parentNode: CustomParentNode) => ValidationDiagnostic[];
  /** Optional serializer emitting the custom node as an XML string. */
  serialize?: (node: T, indentLevel: number) => string;
}
```

### `CustomTagParseContext`

```ts
interface CustomTagParseContext {
  /** Lowercase tag name being parsed. */
  tagName: string;
  /** Raw string attributes from the source XML. */
  attributes: Record<string, string>;
  /** Raw nested child records produced by the XML parser. */
  children: unknown[];
  /** Text content, when present. */
  textContent?: string;
  /** The parent AST node that will own this custom node. */
  parentASTNode: CustomParentNode;
}
```

### `CustomASTNode`

```ts
interface CustomASTNode {
  /** Discriminator — always 'custom'. */
  type: "custom";
  /** Exact XML tag name. */
  tagName: string;
  /** Raw string attributes from the source XML. */
  attributes: Record<string, string>;
  /** Nested custom / standard children, when present. */
  children?: (CustomASTNode | StateNode | Transition)[];
  /** Raw text content, when present. */
  textContent?: string;
  /** Optional strongly-typed, tag-specific payload. */
  payload?: Record<string, unknown>;
}
```

### Parsed & opaque behavior

- **Registered** custom tags inside `<metadata>` → parsed into `customChildren`
  via their `parse` hook.
- **Unregistered** tags inside `<metadata>` → preserved verbatim as opaque
  `MetadataBlock` + a `WARN_UNREGISTERED_METADATA_TAG` warning.
- **Registered** tags outside `<metadata>` → a `WARN_CUSTOM_TAG_OUTSIDE_METADATA`
  warning (they are not honored outside metadata).

---

## 9. The in-memory AST

The AST is a nested **plain-object tree** of TypeScript interfaces — not a
`Map`/`Set` structure. `SCXMLDocument` wraps a single `scxml: SCXMLElement`;
every SCXML element has a dedicated node type; every tag maps to one interface.

### Root & hierarchy

```ts
SCXMLDocument  { scxml: SCXMLElement }

SCXMLElement {
  name?: string;
  xmlns?: string;
  version?: string;
  datamodel?: string;             // 'early' | 'late'
  binding?: "early" | "late";
  initial?: string;               // space-separated list allowed
  states: StateNode[];
  parallels: ParallelNode[];
  finals: FinalNode[];
  scripts: ScriptElement[];
  datamodelChildren?: DataElement[];
  metadata: MetadataBlock[];
  customChildren?: CustomASTNode[];
}

type StateNodeLike = StateNode | ParallelNode | FinalNode;
```

`<state>` and `<parallel>` live in **separate arrays** (semantically distinct
regions). `Transition.target` is a raw state **id string**, not a pointer — the
graph is resolved lazily, keeping the AST a pure acyclic tree with no circular
references.

### Nodes

| Type              | Notable fields                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StateNode`       | `id`, `type?`, `initial?`, `initialBlock?`, `transitions`, `states`, `parallels`, `finals`, `history`, `datamodel?`, `onentry?`, `onexit?`, `invoke`, `metadata`, `customChildren?`, `scxmlStringRange?` |
| `ParallelNode`    | `id`, `initialBlock?`, `transitions`, `states`, `parallels`, `finals`, `history`, `datamodel?`, `onentry?`, `onexit?`, `invoke`, `metadata`, `customChildren?`, `scxmlStringRange?`                      |
| `FinalNode`       | `id`, `onentry?`, `onexit?`, `donedata?`, `metadata`, `customChildren?`, `scxmlStringRange?`                                                                                                             |
| `HistoryNode`     | `id`, `type?: "shallow" \| "deep"`, `transition?`, `scxmlStringRange?`                                                                                                                                   |
| `Transition`      | `id?`, `event?`, `cond?`, `target?`, `type?: "internal" \| "external"`, `executable`, `metadata`, `customChildren?`, `scxmlStringRange?`                                                                 |
| `InitialBlock`    | `transition?: Transition[]`, `blocks?: InitialBlock[]`, `scxmlStringRange?`                                                                                                                              |
| `DataElement`     | `id`, `src?`, `expr?`, `confType?`, `text?`                                                                                                                                                              |
| `InvokeElement`   | `type?`, `src?`, `id?`, `idlocation?`, `srcexpr?`, `autoforward?`, `param?`, `finalize?`, `content?`                                                                                                     |
| `ParamElement`    | `name`, `expr?`, `location?`                                                                                                                                                                             |
| `ContentElement`  | `expr?`, `text?`                                                                                                                                                                                         |
| `DoneDataElement` | `content?`, `param?`                                                                                                                                                                                     |
| `ScriptElement`   | `src?`, `text?`                                                                                                                                                                                          |
| `MetadataBlock`   | `tag`, `attributes`, `text?: string \| number`                                                                                                                                                           |

### Source ranges (`scxmlStringRange`)

When `parseSCXML` is called with `{ captureStringPositions: true }`, primary
AST nodes carry a `scxmlStringRange` describing where their XML text appears in
the raw source string. This powers editor code↔canvas sync (mapping a Monaco
cursor/selection to a node, and back).

```ts
interface Position {
  /** 1-based line in the text buffer. */
  line: number;
  /** 1-based column on that line. */
  column: number;
  /** 0-based absolute character index (UTF-16 code units). */
  offset: number;
}

interface ScxmlStringRange {
  /** Position of the node's opening text (the '<' of its start tag). */
  start: Position;
  /** Position just past the node's closing text (past the '>' of its end/self-close tag). */
  end: Position;
}
```

Important semantics:

- **Snapshots, not metadata.** Ranges record positions in the **exact string
  passed to `parseSCXML`**. They are never serialized back into the XML.
- **Stale after change.** Serializing or mutating the AST produces new text,
  so the old ranges no longer point at the right places — **re-parse** to
  refresh. This matches the natural editor loop (debounced re-parse on edit).
- **Formatting-dependent.** The same logical document formatted differently
  (pretty vs minified) yields different ranges, because they are positions in
  that literal input.
- **Opt-in cost.** Reading ranges adds a source-scanning pass; leave
  `captureStringPositions` off (the default) unless you need them.

```ts
const ast = SCXMLEngine.parse(xml, { captureStringPositions: true }).data!;
for (const t of ast.scxml.states[0].transitions) {
  // Jump Monaco to the transition's opening line:
  monaco.revealPositionInCenter({
    lineNumber: t.scxmlStringRange!.start.line,
    column: t.scxmlStringRange!.start.column,
  });
}
```

### Executable content

Executable children (`<raise>`, `<if>`, `<elseif>`, `<else>`, `<foreach>`,
`<log>`, `<assign>`, `<send>`, `<cancel>`, `<script>`) form a single
`ExecutableContent[]` union, each branch discriminated by a `kind` literal:

```ts
type ExecutableContent =
  | RaiseElement // kind: 'raise',   event
  | IfElement // kind: 'if',      cond, executable
  | ElseIfElement // kind: 'elseif',  cond, executable
  | ElseElement // kind: 'else',    executable
  | ForEachElement // kind: 'foreach', array, item, index?, executable
  | LogElement // kind: 'log',     label?, expr?
  | AssignElement // kind: 'assign',  location, expr?
  | SendElement // kind: 'send',    event?, eventexpr?, target?, targetexpr?,
  //                                   type?, typeexpr?, id?, idlocation?,
  //                                   delay?, delayexpr?, namelist?, param?, content?
  | CancelElement // kind: 'cancel',  sendid?, sendidexpr?
  | ScriptElement; // (no kind field; detected via isScriptElement)
```

### `TransitionParent`

The owning element passed to `walkTransitions` callbacks:

```ts
type TransitionParent = StateNodeLike | InitialBlock | HistoryNode;
```

---

## 10. End-to-end pipeline example

```ts
import { SCXMLEngine } from "scxml-parser";

// 1. Parse
const result = SCXMLEngine.parse(rawXml);
if (!result.success) {
  throw new Error(result.errors.map((e) => e.message).join("\n"));
}
const ast = result.data;

// 2. Validate
const issues = SCXMLEngine.validate(ast);
if (issues.some((d) => d.severity === "error")) {
  /* handle */
}

// 3. Index every edge (stable ids)
const edgeMap = new Map<string, unknown>();
SCXMLEngine.walkTransitions(ast, (t, parent) => {
  edgeMap.set(t.id!, { transition: t, parent });
});

// 4. Mutate
ast.scxml.datamodelChildren = ast.scxml.datamodelChildren || [];
ast.scxml.datamodelChildren.push({ id: "rule", expr: "Order.total > 100" });

// 5. Serialize back to XML
const xml = SCXMLEngine.serialize(ast, { pretty: true });
```

---

## 11. Relation to design docs

- [`CUSTOM_TAG.md`](./CUSTOM_TAG.md) — deep dive on the custom-tag registry
  and the metadata scoping rules summarized in §8.
- [`RUNTIME_ENGINE.md`](./RUNTIME_ENGINE.md) — design of the derived execution
  runtime graph (event indexing, exit/entry sets, active configuration).
- [`LAYOUT-NODES.md`](./LAYOUT-NODES.md) — visual layout capture stored in
  SCXML `<metadata>`, and the stable transition-id / edge-index patterns.
- [`monaco_reactflow_sync.md`](./monaco_reactflow_sync.md) — consumer guide for
  wiring this library into a Monaco + React Flow editor with two-way sync.
