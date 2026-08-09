# Layout Nodes — Visual Coordinate Capture in SCXML Metadata

This document specifies how the visual UI layer persists node/edge layout
coordinates into SCXML while **staying within standard SCXML semantics**.

Layout data is stored inside SCXML `<metadata>` blocks, marked with a
distinguishing attribute, rather than as top-level custom tags. This avoids
introducing tags that could collide with domain/consumer tags or with W3C
semantics, and keeps the serialized document valid and portable.

The UI editor drags/resizes nodes and routes edges; the resulting coordinates
are captured as layout metadata on the relevant AST node and round-trip
losslessly through the parse → serialize pipeline.

> **Design decisions (v2):**
>
> 1. **Final states** — the parser will collect layout metadata on `<final>`
>    nodes too (a small, contained change), so terminal states are draggable.
> 2. **Metadata, not plain tags** — layout lives inside `<metadata>` using a
>    custom element marked with a layout-specific attribute, avoiding
>    collisions with consumer semantics.
> 3. **Editor-agnostic AST** — `scxml-parser` exposes a clean read/write layout
>    API; the editor is a separate project that syncs against this AST.

---

## 1. Storing layout inside `<metadata>`

Per SCXML, `<metadata>` may contain arbitrary well-formed XML from other
namespaces. We use that to hold layout without polluting the statechart's
semantics. Each layout element carries a marker attribute (e.g.
`layout="true"`) so consumers and tooling can recognize it as layout
information and safely strip or ignore it.

Example:

```xml
<state id="Idle">
  <metadata>
    <layout:node layout="true" x="40" y="90" width="200" height="80"/>
  </metadata>
  <transition event="SUBMIT" target="Processing">
    <metadata>
      <layout:waypoint layout="true" x="120" y="130"/>
      <layout:waypoint layout="true" x="180" y="130"/>
    </metadata>
  </transition>
</state>
```

The `layout="true"` attribute is the canonical marker that an element inside
`<metadata>` carries layout data. A `role="layout"`-style marker on the
`<metadata>` block itself could be added as a secondary signal if desired.

---

## 2. Typed representations

```typescript
import type { SCXMLElement, StateNode, Transition } from "./types/ast";

export interface NodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Waypoint {
  x: number;
  y: number;
}
```

The AST already preserves unknown `<metadata>` blocks verbatim as
`MetadataBlock { tag, attributes, text? }`. Layout read/write helpers operate
on these blocks, so no new AST node shape is required and nothing can collide
with consumer tags outside the metadata namespace.

---

## 3. Recognizer / serializer for layout metadata

A small module (`src/layout/layoutSchema.ts`) knows how to recognize and render
the layout metadata elements:

- **`isLayoutBlock(block)`** — true when the metadata block's child tag is the
  layout element (contains the `layout="true"` marker).
- **`parseNodeLayout(block)` → `NodeLayout`** — converts `<layout:node>` attrs
  (`x`, `y`, `width`, `height`) into a typed object, falling back to defaults.
- **`parseWaypoint(block)` → `Waypoint`** — converts `<layout:waypoint>` attrs.
- **`renderNodeLayout(layout)` / `renderWaypoint(wp)`** — emit the metadata
  element string with the `layout="true"` marker.

These map 1:1 onto the existing `metadata` array on `SCXMLElement`, `StateNode`,
`ParallelNode`, `FinalNode`, and (for edges) the transition's metadata.

---

## 4. Read / update helpers (immutable)

The editor-facing API is small, generic, and editor-agnostic:

```typescript
// Node position
export function getNodeLayout(
  node: StateNode | ParallelNode | FinalNode | SCXMLElement,
): NodeLayout;
export function setNodeLayout(
  node: StateNode | ParallelNode | FinalNode | SCXMLElement,
  layout: NodeLayout,
): typeof node;

// Edge waypoints
export function getTransitionWaypoints(transition: Transition): Waypoint[];
export function setTransitionWaypoints(
  transition: Transition,
  waypoints: Waypoint[],
): Transition;
```

- `get*` reads the layout metadata block and returns typed values (with
  defaults when absent).
- `set*` **immutably** appends/updates the layout metadata block and returns a
  new node (no mutation), keeping editor state predictable.
- All functions are framework-agnostic; any canvas/editor can map its own
  coordinates to/from this API.

### Stable transition ids (for edge identity)

Edges (transitions) carry a stable, editor-facing `id` on the AST `Transition`
node. It is persisted inside the transition's `<metadata>` as a `transitionId`
element so it survives round-trips while keeping the SCXML standard-compliant:

```xml
<transition event="SUBMIT" target="Processing">
  <metadata>
    <transitionId id="t_submit" />
    <layout:waypoint layout="true" x="120" y="130" />
  </metadata>
</transition>
```

Id resolution (explicit wins, deterministic fallback):

- **Explicit id**: the parser reads a consumer-provided `transitionId`
  (attribute form `id` or `value`, or trimmed text form) → `transition.id`.
- **Deterministic fallback**: when no explicit id is present, the parser
  derives a stable id from the source and target states —
  `${sourceId}:${targetId}` — and appends `_1`, `_2`, … when multiple
  transitions share the same `source:target` pair (e.g. different events
  between two states). The derived id is **persisted** as a `transitionId`
  metadata element so it stays stable across `parse → serialize → parse`.
- **Serializer**: `transition.id` is always authoritatively written back as a
  `transitionId` metadata element (replacing any stale one), so manual edits
  to `transition.id` win and other metadata (waypoints, notes, …) are kept.
- This gives readers a stable identity for React Flow edge keys, waypoint
  indexing, and Monaco ↔ canvas cross-highlighting.

For initial-block (`<initial>`) and `<history>` default transitions, the
source for the derived id is the **owning state / parallel / history id**.

### Indexing every edge with `walkTransitions`

`walkStates` only visits state-like nodes — it misses `<initial>` default
transitions and `<history>` default transitions. Use the library's
`walkTransitions(doc, visit)` helper to enumerate **every** edge, indexed by
the now-always-present `transition.id`:

```typescript
import { walkTransitions } from "scxml-parser";
import type { TransitionParent } from "scxml-parser";

const edges = new Map<string, EdgeInfra>();
walkTransitions(ast, (transition, parent: TransitionParent) => {
  const id = transition.id!; // explicit or deterministic
  edges.set(id, { transition, parent, label: transition.event });
});
// render loop: const edge = edges.get(edgeId)
```

This mirrors the mitigation in `monaco_reactflow_sync.md` §7 while keeping all
layout-specific logic consumer-side.

### Avoid repeating `.find()` in render loops

Reading layout via `customChildren.find()` on every frame is `O(K)` per node
and adds avoidable work at 60fps. Instead, **index layouts once** during the
AST → canvas conversion pass using the library's structural
`walkStates(doc, visit)` helper, then read from a `Map` in the render loop:

```typescript
import { walkStates } from "scxml-parser";

const layoutMap = new Map<string, NodeLayout>();
walkStates(ast, (node) => {
  const layout = getNodeLayout(node);
  if (layout) layoutMap.set(node.id, layout);
});
// render loop: const pos = layoutMap.get(stateId)
```

This mirrors the mitigation in `monaco_reactflow_sync.md` §7 while keeping all
layout-specific logic consumer-side.

---

## 5. Parser / Serializer changes (final states only)

To place `<final>` nodes freely, the parser must now collect layout metadata on
`FinalNode`:

- **Parser** (`src/parser/index.ts`): in `normalizeFinalNode`, preserve the
  `<metadata>` block into `final.metadata` (mirroring how root/state already
  handle metadata). This is the only core change — no layout _logic_ lives in
  the parser, only faithful metadata preservation.
- **Serializer** (`src/serializer/index.ts`): emit `final.metadata` the same
  way states/root do today.
- **Metamodel note**: layout is _recognized_ (parsed/rendered) by the layout
  module, not by the core. The core treats it as opaque metadata, so consumer
  domain tags and layout metadata never collide or require registration.

---

## 6. Serialized example

Given a state dragged to `(40, 90)` sized `200x80`, and an edge with two
routing waypoints, the emitted SCXML looks like:

```xml
<scxml version="1.0" initial="Idle">
  <state id="Idle">
    <metadata>
      <layout:node layout="true" x="40" y="90" width="200" height="80"/>
    </metadata>
    <transition event="SUBMIT" target="Processing">
      <metadata>
        <layout:waypoint layout="true" x="120" y="130"/>
        <layout:waypoint layout="true" x="180" y="130"/>
      </metadata>
    </transition>
  </state>
  <state id="Processing">
    <metadata>
      <layout:node layout="true" x="300" y="90" width="200" height="80"/>
    </metadata>
  </state>
</scxml>
```

Layout data stays inside `<metadata>`, marked with `layout="true"`, so it is
valid SCXML, portable, and strip-able — while never colliding with consumer or
domain tags.

---

## 7. Notes & scope

- **Final states**: layout metadata is collected on `<final>` (the decision in
  scope); `history` stays a container-affiliate (UI positions the enclosing
  state).
- **Marker attribute**: `layout="true"` on the metadata element is the
  canonical recognition signal; a `role="layout"` marker on the `<metadata>`
  block itself can be added later as a secondary signal.
- **Editor-agnostic**: functions are pure read/update over the AST — any
  editor (React Flow, custom SVG, etc.) can bind to them.
- **Runtime engine**: layout metadata is inert for execution; the derived
  runtime graph (see `RUNTIME_ENGINE.md`) strips it during compilation.
