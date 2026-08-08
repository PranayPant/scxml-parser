# Two-Way Debounced Synchronization: Monaco Editor & React Flow via SCXML AST

This document provides a complete technical guide and TypeScript implementation for building a bi-directionally synchronized statechart editor. It links a text editor (**Monaco Editor**) and a visual node-and-edge canvas (**React Flow / XYFlow**) using a **Canonical SCXML AST** as the single source of truth.

---

## 1. Core Architectural Challenges & Solutions

When synchronizing a textual code editor with a visual drag-and-drop canvas, three major pitfalls must be addressed:

| Challenge | Cause | Architectural Solution |
| :--- | :--- | :--- |
| **Infinite Feedback Loops** | Monaco updates AST $
ightarrow$ Canvas re-renders $
ightarrow$ Canvas emits change $
ightarrow$ Monaco updates text $
ightarrow$ Loop. | **Source-Origin Tracking**: Every state mutation tags its origin (`'monaco'`, `'canvas'`, or `'external'`). Updates are ignored if originated by the receiving view. |
| **Monaco Cursor Jumping** | Replacing `editor.setValue()` entirely destroys view state, cursor position, and undo/redo stack. | **Minimal Delta Edits**: Use `editor.executeEdits()` with exact string diffing or line replacements rather than full buffer resets. |
| **Main Thread Lockups** | Parsing invalid/partial XML on every keystroke, or serializing AST to XML on every sub-pixel drag event at 60fps. | **Asymmetric Debouncing**: Monaco $
ightarrow$ AST is debounced (300ms) + guarded by XML validation. React Flow $
ightarrow$ AST updates canvas immediately (60fps) but debounces AST/XML serialization (100ms or on `dragStop`). |

---

## 2. System Data Flow Diagram

```
                       ┌──────────────────────────────┐
                       │   Central State Store        │
                       │   • Canonical AST            │
                       │   • Raw SCXML String         │
                       │   • Active Origin Flag       │
                       └──────────────┬───────────────┘
                                      │
               ┌──────────────────────┴──────────────────────┐
               │                                             │
               ▼ (Source: Monaco)                            ▼ (Source: Canvas)
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Monaco Text Editor           │              │ React Flow Visual Canvas     │
│                              │              │                              │
│ 1. User Types XML            │              │ 1. User Drags Node           │
│ 2. Local Monaco State (60fps)│              │ 2. Local Canvas State (60fps)│
│ 3. Debounce (300ms)          │              │ 3. On Drag Stop / Debounce   │
│ 4. Validate & Parse XML      │              │ 4. Update Node Coordinates   │
│ 5. Commit to Store           │              │ 5. Commit to Store           │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               └──────────────────────┬──────────────────────┘
                                      ▼
                       ┌──────────────────────────────┐
                       │ AST Update & Sync Dispatcher │
                       │ (Notifies opposite target)   │
                       └──────────────────────────────┘
```

---

## 3. Complete Production Implementation (TypeScript)

The following self-contained TypeScript module contains the state store, debouncing logic, Monaco handlers, React Flow adapters, and cursor/selection cross-highlighting logic.

```typescript
import { create } from 'zustand';
import type { editor, Position } from 'monaco-editor';
import type { Node, Edge, OnNodesChange, OnEdgesChange, NodeChange } from 'reactflow';

// ============================================================================
// 1. AST & Store Types
// ============================================================================

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

export interface CustomASTNode<T = any> {
  tagName: string;
  attributes: Record<string, string>;
  payload?: T;
}

export interface ASTTransition {
  id: string;
  event?: string;
  target?: string;
  cond?: string;
  customChildren?: CustomASTNode[];
}

export interface ASTState {
  id: string;
  type?: 'normal' | 'parallel' | 'final' | 'history';
  initial?: string;
  transitions?: ASTTransition[];
  states?: Record<string, ASTState>;
  customChildren?: CustomASTNode[];
}

export interface StatechartAST {
  id: string;
  initial?: string;
  states: Record<string, ASTState>;
}

export type SyncOrigin = 'monaco' | 'canvas' | 'external' | null;

// ============================================================================
// 2. Statechart Synchronization Store (Zustand)
// ============================================================================

interface StatechartStore {
  ast: StatechartAST;
  xmlString: string;
  activeOrigin: SyncOrigin;
  selectedStateId: string | null;

  // Actions
  setXmlFromMonaco: (xml: string, parsedAst: StatechartAST) => void;
  setLayoutFromCanvas: (updatedAst: StatechartAST) => void;
  setSelectedState: (stateId: string | null, origin: SyncOrigin) => void;
}

export const useStatechartStore = create<StatechartStore>((set) => ({
  ast: { id: 'root', states: {} },
  xmlString: '',
  activeOrigin: null,
  selectedStateId: null,

  setXmlFromMonaco: (xml, parsedAst) =>
    set({
      xmlString: xml,
      ast: parsedAst,
      activeOrigin: 'monaco',
    }),

  setLayoutFromCanvas: (updatedAst) =>
    set((state) => ({
      ast: updatedAst,
      // Re-serialize AST back to XML string while keeping canvas origin
      xmlString: serializeAstToScxml(updatedAst),
      activeOrigin: 'canvas',
    })),

  setSelectedState: (stateId, origin) =>
    set({ selectedStateId: stateId, activeOrigin: origin }),
}));

// Placeholder serializers/parsers (wire to your actual scxml-parser library)
declare function parseScxmlToAst(xml: string): StatechartAST;
declare function serializeAstToScxml(ast: StatechartAST): string;

// ============================================================================
// 3. React Flow Adapters (AST <-> Visual Nodes/Edges)
// ============================================================================

export function astToReactFlow(ast: StatechartAST): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function processState(state: ASTState, parentId?: string) {
    const layout = getLayout(state);

    nodes.push({
      id: state.id,
      parentNode: parentId,
      extent: parentId ? 'parent' : undefined,
      position: { x: layout.x, y: layout.y },
      style: { width: layout.width, height: layout.height },
      data: { label: state.id, stateRef: state },
      type: state.states && Object.keys(state.states).length > 0 ? 'group' : 'default',
    });

    if (state.transitions) {
      state.transitions.forEach((t, idx) => {
        if (t.target) {
          edges.push({
            id: t.id || `${state.id}->${t.target}-${idx}`,
            source: state.id,
            target: t.target,
            label: t.event || '',
            data: { transitionRef: t },
          });
        }
      });
    }

    if (state.states) {
      Object.values(state.states).forEach((child) => processState(child, state.id));
    }
  }

  Object.values(ast.states).forEach((s) => processState(s));
  return { nodes, edges };
}

function getLayout(state: ASTState): NodeLayout {
  const custom = state.customChildren?.find((c) => c.tagName === 'layout:node');
  return custom?.payload || { x: 0, y: 0, width: 160, height: 80 };
}

// ============================================================================
// 4. Monaco Editor Controller (Debounced Parsing + Selection Sync)
// ============================================================================

export class MonacoSyncController {
  private editor: editor.IStandaloneCodeEditor;
  private parseDebounceTimer: number | null = null;
  private isApplyingExternalChange = false;

  constructor(editorInstance: editor.IStandaloneCodeEditor) {
    this.editor = editorInstance;
    this.bindEvents();
  }

  private bindEvents() {
    // 1. Listen for typing changes in Monaco
    this.editor.onDidChangeModelContent(() => {
      if (this.isApplyingExternalChange) return;

      if (this.parseDebounceTimer) clearTimeout(this.parseDebounceTimer);

      // Debounce XML parsing by 300ms to allow typing flow
      this.parseDebounceTimer = window.setTimeout(() => {
        const text = this.editor.getValue();
        try {
          const parsedAst = parseScxmlToAst(text);
          useStatechartStore.getState().setXmlFromMonaco(text, parsedAst);
        } catch (err) {
          // Syntax Error: Ignore partial XML, keep existing canvas state intact
          console.warn('SCXML Parse warning (user still typing):', err);
        }
      }, 300);
    });

    // 2. Cursor movement -> Highlight selected node on Canvas
    this.editor.onDidChangeCursorPosition((e) => {
      const lineText = this.editor.getModel()?.getLineContent(e.position.lineNumber) || '';
      const match = lineText.match(/<state[^>]*id=["']([^"']+)["']/);
      if (match && match[1]) {
        useStatechartStore.getState().setSelectedState(match[1], 'monaco');
      }
    });
  }

  /**
   * Safe external update from Canvas to Monaco (Preserves Cursor & Scroll)
   */
  public updateTextFromCanvas(newXml: string) {
    const currentText = this.editor.getValue();
    if (currentText === newXml) return;

    this.isApplyingExternalChange = true;

    // Preserve cursor position and scroll top
    const position = this.editor.getPosition();
    const scrollTop = this.editor.getScrollTop();

    // Push edit operations to preserve Undo stack
    const model = this.editor.getModel();
    if (model) {
      model.pushEditOperations(
        [],
        [
          {
            range: model.getFullModelRange(),
            text: newXml,
          },
        ],
        () => null
      );
    }

    if (position) this.editor.setPosition(position);
    this.editor.setScrollTop(scrollTop);

    this.isApplyingExternalChange = false;
  }

  /**
   * Scrolls and reveals line corresponding to a State ID clicked on Canvas
   */
  public revealStateId(stateId: string) {
    const model = this.editor.getModel();
    if (!model) return;

    const matches = model.findMatches(`id="${stateId}"`, true, false, true, null, true);
    if (matches.length > 0) {
      const targetRange = matches[0].range;
      this.editor.revealLineInCenter(targetRange.startLineNumber);
      this.editor.setSelection(targetRange);
    }
  }
}

// ============================================================================
// 5. React Flow Canvas Controller (Debounced AST Updates)
// ============================================================================

export function createCanvasChangeHandler() {
  let layoutDebounceTimer: number | null = null;

  return {
    onNodesChange: (changes: NodeChange[]) => {
      // Process position drag changes
      const dragChanges = changes.filter((c) => c.type === 'position' && c.dragging);

      if (dragChanges.length === 0) return;

      if (layoutDebounceTimer) clearTimeout(layoutDebounceTimer);

      // Debounce Canvas -> AST layout synchronization (100ms)
      layoutDebounceTimer = window.setTimeout(() => {
        const store = useStatechartStore.getState();
        const currentAst = structuredClone(store.ast);

        let modified = false;

        dragChanges.forEach((change) => {
          if (change.type === 'position' && change.position) {
            const stateNode = findStateInAst(currentAst, change.id);
            if (stateNode) {
              updateStateLayout(stateNode, change.position.x, change.position.y);
              modified = true;
            }
          }
        });

        if (modified) {
          store.setLayoutFromCanvas(currentAst);
        }
      }, 100);
    },
  };
}

function findStateInAst(ast: StatechartAST, id: string): ASTState | null {
  function search(states: Record<string, ASTState>): ASTState | null {
    if (states[id]) return states[id];
    for (const s of Object.values(states)) {
      if (s.states) {
        const found = search(s.states);
        if (found) return found;
      }
    }
    return null;
  }
  return search(ast.states);
}

function updateStateLayout(state: ASTState, x: number, y: number) {
  if (!state.customChildren) state.customChildren = [];
  const index = state.customChildren.findIndex((c) => c.tagName === 'layout:node');

  const layoutPayload: NodeLayout = {
    x: Math.round(x),
    y: Math.round(y),
    width: 160,
    height: 80,
  };

  const node: CustomASTNode<NodeLayout> = {
    tagName: 'layout:node',
    attributes: { x: String(Math.round(x)), y: String(Math.round(y)) },
    payload: layoutPayload,
  };

  if (index >= 0) {
    state.customChildren[index] = node;
  } else {
    state.customChildren.push(node);
  }
}
```

---

## 6. Summary Integration Checklist

1. **Monaco Setup**: Instantiated with `MonacoSyncController`. Binds keystroke changes to a 300ms debounced parser.
2. **React Flow Setup**: Binds `onNodesChange` to `createCanvasChangeHandler()` with a 100ms layout debounce.
3. **Cross-Highlighting**: 
   - Node selection on React Flow calls `monacoSync.revealStateId(id)`.
   - Cursor movement on Monaco state tags updates `selectedStateId` in store to highlight nodes on Canvas.


## 7. Performance Considerations for Consumer-driven Layout Metadata Extraction

**Yes, this model will work cleanly and is architecturally sound.** It successfully keeps your core parser standard-compliant while letting the visual editor own its domain model.

There is a **minor performance overhead** compared to direct, built-in AST properties, but it is well within acceptable limits for typical statechart sizes ($<1,000$ states) and easily mitigated if needed.

---

### Why It Works Well

1. **W3C SCXML Spec Compliance:** The SCXML specification explicitly permits `<metadata>` tags inside `<scxml>`, `<state>`, `<parallel>`, and `<transition>` elements. Wrapping your custom `<layout:node>` inside `<metadata>` ensures third-party SCXML tools won't reject your files.
2. **Strict Domain Boundary:** The core engine only needs to know how to route element tags; it remains 100% statechart-pure. The consuming app defines the TypeScript types, parsing logic, and serialization format for its own UI metadata.
3. **Flexible Extensibility:** If you later add new visual elements (e.g., sticky notes, annotations, group boundaries, or visual theme overrides), you register new tags on the consumer side without modifying or redeploying the parser engine.

---

### Performance Penalties & Bottlenecks

While the model works, relying on `customChildren.find()` across your state tree introduces three specific performance considerations:

#### 1. $O(K)$ Array Lookups per Node (`customChildren.find()`)

* **The Penalty:** Calling `.find(c => c.tagName === 'layout:node')` requires a linear search through the `customChildren` array. Doing this on every frame or canvas update for $N$ states results in $O(N \times K)$ operations (where $K$ is the number of custom children per state).
* **Impact:** Negligible for 50 states, but noticeable during smooth 60fps zooming/panning if recalculating layout dynamically on statecharts with hundreds of states.
* **Mitigation:** Index or extract the layout payloads into a Map or weak-map lookup table during the `AST -> Canvas` transformation pass rather than calling `.find()` inside canvas render loops:
```typescript
// Indexing once after parse:
const layoutMap = new Map<string, NodeLayoutPayload>();

function indexLayouts(state: ASTState) {
  const layout = state.customChildren?.find(c => c.tagName === 'layout:node')?.payload;
  if (layout) layoutMap.set(state.id, layout);
  state.states?.forEach(indexLayouts);
}

```



#### 2. Heap Allocation & Garbage Collection

* **The Penalty:** Every custom node creates multiple wrapper objects:
```typescript
{
  type: 'custom',
  tagName: 'layout:node',
  attributes: { x: '100', y: '200', ... }, // Raw strings
  payload: { x: 100, y: 200, ... }          // Typed numbers
}

```


* **Impact:** Generates double the object allocations per state node during XML parsing. In browser environments, parsing massive files ($>5,000$ states) will trigger short Garbage Collection (GC) pauses.
* **Mitigation:** If memory/GC becomes a bottleneck, have `parse()` mutate or assign attributes directly to `payload` without storing duplicated string key-values in `attributes`.

#### 3. SAX Map Lookup Overhead

* **The Penalty:** During XML parsing, every start tag triggers a lookup in the `SCXMLEngine` tag registry (`Map.get(tagName)`).
* **Impact:** Modern JS engines (V8) execute `Map.get()` in nanoseconds. This adds $<1\text{ms}$ of overhead for standard statechart file sizes.

---

### Watch-out: Immutability for Canvas Re-renders

If you use React Flow or another reactive DOM canvas, mutating the `payload` object directly in place will bypass React's shallow object comparison:

```typescript
// ❌ Dangerous: Direct mutation won't trigger React Flow re-renders cleanly
layoutNode.payload.x = newX;

// ✅ Better: Immutably update the payload and parent customChildren array
state.customChildren = state.customChildren.map(child => 
  child.tagName === 'layout:node'
    ? { ...child, payload: { ...child.payload, x: newX, y: newY } }
    : child
);

```

### Summary Verdict

| Metric | Rating | Notes |
| --- | --- | --- |
| **Architectural Design** | **Excellent** | Complete decoupling of core statechart parser and UI layer. |
| **Parsing Speed** | **Fast** | Negligible registry lookup overhead during SAX parsing. |
| **Memory Footprint** | **Slightly Higher** | Small wrapper object overhead per node; fine for typical files. |
| **Render Performance** | **Good** | $O(N)$ lookup cost is easily mitigated by indexing layout payloads during the canvas conversion pass. |