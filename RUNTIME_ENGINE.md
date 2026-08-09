# SCXML Execution Engine — Derived Runtime Graph Design

This document specifies the execution layer for `scxml-parser`. The AST is the
**source of truth for syntax** (parsing, validation, editing, serialization,
round-tripping). Execution runs against a **derived runtime graph** compiled
once from the AST, so the hot path never fights the document model.

```
                       ┌─────────────────────────┐
                       │   SCXML Source Code     │
                       └────────────┬────────────┘
                                    │
                                    ▼  (Parse step)
                       ┌─────────────────────────┐
                       │       SCXML AST         │ ◄─── Validation, Editing,
                       └────────────┬────────────┘      Serialization, Round-trip
                                    │
                                    ▼  (Compile / Derive step)
                       ┌─────────────────────────┐
                       │  Derived Runtime Graph  │ ◄─── Fast Execution Engine
                       │ ─────────────────────── │      • Active Configuration Set
                       │ • O(1) State Lookups    │      • Event-Keyed Transition Tables
                       │ • Parent Links          │      • Pre-computed Exit/Entry Sets
                       │ • Datamodel / Context   │      • History Resolution
                       └─────────────────────────┘
```

## 1. Why a separate runtime graph (not the AST)

The AST is a faithful, lossless mirror of the source XML — ideal for
round-tripping and typed validation, but awkward for execution:

- State lookup by id requires scans or an index the AST doesn't keep.
- No parent pointers; ancestor walks (needed for internal/external transitions
  and shallow/deep entry) must be derived.
- Transitions are stored as an unordered per-state array with no event index.
- The "current state" of a running chart is really a **set** of active atomic
  states (required for `<parallel>`), which the AST's single-node model can't
  express.

So we **compile** the AST into a runtime model once, and step events against
that model.

## 2. Runtime graph structure

Compiled once from the AST into a `RuntimeStateMachine`:

```
RuntimeStateMachine
├── states: Map<stateId, RuntimeState>        // O(1) lookup by id
├── root: RuntimeState                        // entry point
└── configuration: StateConfiguration         // the active state set
```

Each `RuntimeState`:

```
RuntimeState
├── id: string
├── parent: RuntimeState | null               // O(1) ancestor walks
├── children: RuntimeState[]                  // regions / sub-states
├── kind: 'atomic' | 'compound' | 'parallel' | 'final' | 'history'
├── exitEvents / enterEvents                   // derived from onentry/onexit
├── eventIndex: RuntimeEventIndex              // transitions by event
└── historyTarget?: id                         // for <history>
```

The **active configuration** is an explicit set of currently-active atomic
states, not a single pointer:

```
StateConfiguration = Set<RuntimeState>   // includes root + active leaves
```

This is what makes `<parallel>` and compound-state entry/exit tractable.

## 3. Edge case 1 — event index needs wildcard & prefix support

A naive `Map<event, Transition[]>` is insufficient. SCXML event matching
follows dot-delimited hierarchy and wildcards:

- `"user.*"` matches `"user.login"`, `"user.logout"`, etc. (dot-prefix)
- `"*"` matches any event
- `"user.login user.register"` (space-separated) matches either token

**Two-tier event index:**

```
RuntimeEventIndex
├── exact:  Map<eventName, Transition[]>      // O(1) exact hit
└── patterns: sorted wildcard list            // ["user.*", "*", ...]
       · sorted so the most specific (longest prefix) is tried first
       · evaluated only when exact lookup misses
```

Matching algorithm for event `E`:

1. If `exact.get(E)` exists → use those transitions (with `cond` evaluated).
2. Otherwise scan `patterns` from most-specific to least-specific:
   - a `prefix.*` pattern matches when `E === prefix` or `E.startsWith(prefix + '.')`
   - `"*"` is the final fallback and matches always.
3. Evaluate `cond` guards; among eligible candidates, pick per SCXML
   document-order / specificity rules.

## 4. Edge case 2 — pre-compute exit/entry sets via least common ancestor

Because the state hierarchy is **static**, the exit and entry work for every
transition can be computed once at compile time. For each transition
`S_src → S_target`, compute and store:

$$\text{compiled}(t) = \{\, \text{exitSet},\ \text{lcaState},\ \text{entrySet} \,\}$$

- **LCA** = the least common ancestor of `S_src` and `S_target` in the runtime
  tree (nil / root if unrelated at root level).
- **exitSet** = every active state on the path from `S_src` up to (but not
  including) the LCA — i.e. the states that leave the active set.
- **entrySet** = the states on the path from LCA down to `S_target`, expanded
  through compound/parallel (invoking their initial states) — the states that
  enter the active set.

At runtime the engine **does not recompute** ancestor sets on the fly; it reads
`{ exitSet, entrySet }` directly off the compiled transition struct, then:

1. run `onexit` for each state in `exitSet` (deepest first);
2. remove them from the active configuration;
3. run `onentry` for each state in `entrySet` (shallowest first);
4. add them to the active configuration;
5. if the transition has executable content, run it (with datamodel/context);

This gives **O(|exitSet| + |entrySet|)** stepping at runtime instead of repeated
tree walks, and `lcaState` is kept for tools that need the "scope" of the
change (e.g. history semantics).

### Compound/parallel expansion

Entering a compound state pushes its `initial` sub-state (recursively). Entering
a `<parallel>` activates **all** its child regions. Both are resolved during
compilation and folded into each target's `entrySet`.

### History

A `<history>` pseudo-state stores the previously-active sub-configuration of its
parent. On a transition targeting history, the engine restores that recorded
sub-set instead of the default initial expansion; when nothing was recorded, it
uses the history state's default transition.

## 5. Datamodel / context binding

Execution needs a runtime binding separate from the AST's declarative
`<datamodel>` list:

- `datamodel: Map<dataId, value>` initialized from `<data expr|src|text>`.
- A per-event context object (e.g. `{ name, data, type })` bound as `_event`
  so `cond`/`expr` expressions can read it.
- Guards (`cond`) and executable content are invoked against this context,
  keeping the engine UI-agnostic and host-agnostic.

## 6. Summary of responsibilities

| Concern                                                | Owned by                  |
| ------------------------------------------------------ | ------------------------- |
| Parse / Validate / Edit / Serialize / Round-trip       | **AST**                   |
| Fast execution, event dispatch, configuration tracking | **Derived runtime graph** |
| Binding evaluation (`_event`, datamodel)               | **Runtime context**       |

Keep the AST as the single source of truth for syntax; compile the derived
runtime graph for execution.

_See also:_ `CUSTOM_TAG.md` (extensibility) for how custom tags plug into the
parser/validator/serializer pipeline and can later surface in the runtime model.
