# Parallel States — SCXML Standards Alignment (Phase 1)

Research deliverable for Phase 1 of the parallel-states initiative: what the W3C SCXML
recommendation actually requires for `<parallel>`, and how this editor's XML output
(including its `visual:` metadata namespace) must be shaped to stay compliant while
representing multiple parallel hierarchies. First-prototype milestone target: July 27.

Source: [W3C SCXML Recommendation, §3.4](https://www.w3.org/TR/scxml/#parallel).

---

## 1. What `<parallel>` means in the standard

A `<parallel>` element groups child regions that are **all active simultaneously** for
as long as the parallel is active — the opposite of `<state>`/`<scxml>`, where exactly
one child is active at a time. Each direct child that is itself a `<state>` or
`<parallel>` is a **region**. Entering the parallel enters every region at once (each
region recursively enters its own default initial state); exiting the parallel exits
every region at once, children first in document order, then the parallel itself.

### 1.1 Content model

```
<parallel id="ID"?>
  (onentry|onexit)*
  transition*
  (state|parallel|history)*
  datamodel?
  invoke*
</parallel>
```

- **`id`** — optional. If omitted, the processor generates one. This editor should
  always emit an explicit `id` (matches existing `<state>`/`<final>` conventions and is
  required for our node registry, validation, and transition targeting).
- **No `initial` attribute and no `<initial>` child are allowed on `<parallel>` itself**
  — this is deliberate, not an omission: since *all* children are entered, there is no
  "which one first" question at the parallel's own level. Our `ParallelElement` type
  (`src/types/scxml/index.ts:46`) already reflects this correctly (no `initial` field).
- Each **region** (a `<state>` child of `<parallel>`), if compound, still uses the
  normal `initial` attribute / first-child-wins rule to pick its own default substate.
  This is the "each region has its own initial state" requirement from Phase 3 of the
  overall plan — it is enforced per-region, not on the parallel wrapper.
- `<parallel>` can nest (`parallel` inside `parallel`), giving N-way concurrent splits
  at any depth, and a region can itself be a `<parallel>` rather than a `<state>`.

### 1.2 Entry / exit semantics

- On entry to `<parallel>`: run its `<onentry>`, then enter every child region (each
  recursively resolves its own initial configuration).
- On exit: exit every child region (deepest-first, document order), then run the
  parallel's `<onexit>`.
- An event is broadcast to **all** active regions; each region's transitions are
  evaluated independently and may fire different transitions (or none) for the same
  event in the same microstep.

### 1.3 Completion (`done.state.id`)

When every region of a parallel reaches one of its own `<final>` children, the
processor raises `done.state.<parallel-id>`. This is the standard way to let a
transition outside the parallel wait for "all branches finished" rather than "any
branch finished." Regions do not aggregate `<donedata>` automatically the way a single
`<final>` does — only individual `<final>` elements carry `<donedata>`.

### 1.4 Transitions must not jump between regions — this is standards-based, not just an editor rule

This directly grounds Phase 3's "connectivity checks" requirement. The spec computes a
transition's exit set via the **Least Common Compound Ancestor (LCCA)** of its source
and every target. If a transition's target lives in a *different* region of the same
(or a different) `<parallel>`, the LCCA climbs up to the parallel element (or higher),
which means firing that transition would tear down and rebuild the entire parallel —
not just move within it. The spec explicitly calls transitions whose targets span more
than one region of the same parallel **illegal**: an SCXML document containing one is
non-conforming (see the spec's `isLegalConfiguration`/exit-set algorithm and the
associated conformance tests, e.g. test 403c). So:

- A transition may target any descendant **within the same region**.
- A transition may target something **entirely outside the parallel** (legal — this is
  exactly what `done.state.*`-triggered or externally-sourced transitions use to leave
  the whole parallel).
- A transition may **not** target a state that lives in a sibling region of the same
  parallel. The editor's validator should flag this as a standards violation, not just
  a style preference — it produces a non-conforming document, and behavior on engines
  that don't reject it outright is undefined/inconsistent.

This is the precise rule Phase 3 ("parallel state machines remain entirely disconnected
… transitions should not be able to jump from one parallel machine to another") should
implement: walk each transition's target(s) up to find the nearest enclosing
`<parallel>`; if source and target resolve to different immediate regions of that same
`<parallel>`, it's invalid.

---

## 2. Extensibility: where our `visual:` namespace fits

The spec reserves the SCXML namespace for itself but explicitly allows foreign-namespace
attributes/elements as an extension mechanism (this is exactly the pattern this project
already uses for `xmlns:visual` position/size metadata and the `viz:note` element — see
`CLAUDE.md` and `src/types/scxml/index.ts:25-29`). Nothing about `<parallel>` changes
this: `visual:position`, `visual:size`, etc. can be attached to `<parallel>` and to each
region `<state>` exactly like they already are to plain states, and a "clean export"
(metadata-stripping) still produces a document containing only standard SCXML elements
and attributes.

**Implication for the region-container work in Phase 2:** region boundaries (the
"distinct, parallel entities drawn side by side" requirement) are a purely visual
concept with no standard counterpart — there is no `<region>` element in SCXML, only
`<state>`/`<parallel>` used as a region. So region layout (bounding box, side-by-side
placement, spacing) must live entirely in `visual:` attributes on the region's own
`<state>`/`<parallel>` tag, the same container-metadata approach already used for
compound states (see `.claude/plans/hierarchical-state-containment-plan.md`,
`ContainerMetadata`). No new SCXML surface is needed to represent "this is a parallel
region" — that's already implied by the element being a direct child of `<parallel>`.

---

## 3. Compliant XML shape for N-way parallel hierarchies

Two parallel regions, each a compound state with its own initial substate:

```xml
<scxml xmlns="http://www.w3.org/2005/07/scxml"
       xmlns:visual="http://visual-scxml-editor.github.io"
       version="1.0" initial="running">
  <parallel id="running" visual:position="100,100" visual:size="400,240">
    <state id="motor_region" initial="motor_idle" visual:position="0,0" visual:size="180,220">
      <state id="motor_idle">
        <transition event="start" target="motor_running"/>
      </state>
      <state id="motor_running">
        <transition event="stop" target="motor_idle"/>
      </state>
    </state>

    <state id="sensor_region" initial="sensor_idle" visual:position="200,0" visual:size="180,220">
      <state id="sensor_idle">
        <transition event="poll" target="sensor_reading"/>
      </state>
      <state id="sensor_reading">
        <transition event="done" target="sensor_idle"/>
      </state>
    </state>

    <!-- Legal: leaves the whole parallel once both regions signal done -->
    <transition event="done.state.running" target="shutdown"/>
  </parallel>

  <final id="shutdown"/>
</scxml>
```

Illegal (rejected by validation per §1.4 — target crosses from `motor_region` into
`sensor_region`):

```xml
<state id="motor_running">
  <transition event="stop" target="sensor_idle"/>  <!-- crosses regions: invalid -->
</state>
```

Three-or-more-way parallel (Phase 2's "N-parallel machines" requirement) is the same
pattern with additional `<state>` (or nested `<parallel>`) siblings directly under
`<parallel>` — the content model in §1.1 already permits any number of region children,
so no schema extension is required to go from 2 to N regions.

---

## 4. Summary for Phase 2–4 implementers

1. **Parser/types** (`src/types/scxml/index.ts`): already correct — `ParallelElement`
   has no `initial`, supports nested `parallel`/`state`/`history`/`datamodel`/`invoke`.
   No changes needed here for standards compliance.
2. **Validator** (`src/lib/validators/scxml-validator.ts`): already recurses into
   nested parallel structure for structural checks; needs a new rule per §1.4 (reject
   transitions whose targets span sibling regions of the same `<parallel>`), and a rule
   confirming each region has a resolvable initial state (own `initial` attr, or first
   child, or a required explicit `initial` if the editor wants to force explicitness).
3. **Visual layer**: region containers are metadata-only (§2) — reuse the existing
   compound-state container/layout metadata approach rather than inventing new SCXML
   markup. No `ParallelStateNode` component exists yet in
   `src/components/diagram/nodes/` — that's Phase 2 work, not Phase 1.
4. **Export**: no new export logic needed beyond emitting `<parallel>`/region `<state>`
   nesting per §3 and preserving `visual:` attributes the same way other elements do.
