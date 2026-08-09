The updated `scxml-parser` API spec is **roughly 92–95% complete** for serving as the foundational dependency of a two-way visual statechart editor (such as Monaco + React Flow).

The spec directly addresses the major real-time sync and diagnostics gaps, making the Text-to-Canvas pipeline production-ready. There is only one structural area—AST mutation helpers—that requires attention for the Canvas-to-Text pipeline.

---

### Key Wins in the Updated Spec

1. **Resilient / Partial Parsing (`parseSCXMLPartial`)**

- **Why it matters:** In live editor loops, text is transiently broken while the user types.
- **Impact:** Returning a fallback `data: SCXMLDocument` alongside `recoverable: false` prevents React Flow from crashing, unmounting, or resetting canvas camera zoom when syntax errors occur in Monaco.

2. **Direct Diagnostic-to-Canvas Mapping (`nodeId` and `transitionId`)**

- **Why it matters:** `ValidationDiagnostic` now carries explicit AST identifiers alongside line/column locations.
- **Impact:** The visual canvas can draw error badges, red node borders, or tooltip warnings directly on nodes and edges without needing a secondary spatial index to map line numbers back to elements.

3. **Stable Edge Identity & Graph Traversal (`walkTransitions` & `transition.id`)**

- **Why it matters:** React Flow demands persistent edge keys.
- **Impact:** Preserving explicit or derived transition IDs (`a:b`, `a:b_1`) across round-trips ensures canvas edge selections, custom routing control points, and waypoint indexes are preserved during live edits. `walkTransitions` passing `TransitionParent` drastically reduces graph index boilerplate.

---

### Remaining Areas of Friction for Visual Editors

#### 1. Canvas-to-Text Direction: Lack of AST Mutation Helpers

While `serializeSCXML` handles serializing mutated ASTs, modifying nested arrays by hand in the visual layer remains error-prone.

When a user performs actions on the canvas, the UI must manually handle cross-referencing:

- **Renaming a state:** Requires finding the node, updating its `id`, updating every matching string in `transition.target` across the entire tree, updating `scxml.initial` attributes, and updating `<initial>` or `<history>` target references.
- **Deleting a state:** Requires removing the state node and pruning dangling transitions across the graph that targeted the deleted ID.

_Recommendation:_ Consider adding a small set of AST mutation functions (either in core or as an auxiliary `@scxml-parser/mutate` module):

```ts
renameState(doc: SCXMLDocument, oldId: string, newId: string): void;
removeState(doc: SCXMLDocument, stateId: string): void; // Auto-prunes dangling edges
addTransition(doc: SCXMLDocument, sourceId: string, targetId: string, event?: string): Transition;
reparentState(doc: SCXMLDocument, stateId: string, newParentId: string): void;

```

#### 2. Parallel Multi-Target Parsing

In SCXML, transitions can target multiple parallel states simultaneously using space-separated strings:

```xml
<transition target="stateA stateB" />

```

In the current AST, `Transition.target` remains a raw string (`"stateA stateB"`). Because visual node-and-edge engines (like React Flow) require discrete 1-to-1 edges (`source` $\rightarrow$ `target`), your React Flow mapping layer will need to handle splitting target strings into multiple individual visual edges:

```ts
const targetIds = transition.target
  ? transition.target.trim().split(/\s+/)
  : [];
```

#### 3. Deep Source Range Coverage

`scxmlStringRange` is defined on `StateNode`, `ParallelNode`, `FinalNode`, `HistoryNode`, `Transition`, and `InitialBlock`. However, if your visual editor includes a side property inspector for editing action scripts (`<assign>`, `<send>`, `<log>`) or datamodel variables (`<data>`), clicking those fields will not have an exact `scxmlStringRange` to jump the Monaco cursor to that specific line, defaulting instead to the parent state's range.

---

### Summary Checklist for Implementation

| Feature Area                                    | Status in Spec                                               | Visual Editor Readiness |
| ----------------------------------------------- | ------------------------------------------------------------ | ----------------------- |
| **Real-time Typing Sync**                       | `parseSCXMLPartial`                                          | Ready                   |
| **Source Tracking (Code $\rightarrow$ Canvas)** | `scxmlStringRange` on primary nodes                          | Ready                   |
| **Canvas Diagnostics & Badges**                 | `nodeId` & `transitionId` in `ValidationDiagnostic`          | Ready                   |
| **Edge Identity & Waypoints**                   | Persistent `<transitionId>` + fallback `${source}:${target}` | Ready                   |
| **Custom Layout Storage**                       | `<metadata>` block scoping + `TagRegistry`                   | Ready                   |
| **Graph Traversal**                             | `walkStates` and `walkTransitions`                           | Ready                   |
| **AST Mutations (Canvas $\rightarrow$ Code)**   | Manual object/array manipulation required                    | Requires helper logic   |

The spec is ready to begin implementation. Would you like to focus on defining the layout metadata format for node coordinates (`LAYOUT-NODES.md`), or detail the exact React Flow adapter transformation pipeline?
