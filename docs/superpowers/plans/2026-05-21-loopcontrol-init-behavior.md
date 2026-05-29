# LoopControl Init Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the welcome screen flash and default to the Visual Diagram tab when the editor is served inside LoopControl.

**Architecture:** Add `isInitializing` + `isLoopControl` state to `page.tsx`; suppress rendering until the auto-load fetch settles; pass an `initialTab` prop to `TwoTabLayout` so it mounts on the correct tab from the start.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zustand, Tailwind CSS. No test framework — verification via `tsc --noEmit` and manual browser check.

---

## File Map

| File | Change |
|------|--------|
| `src/components/layout/two-tab-layout.tsx` | Add `initialTab?: TabType` prop; use it in `useState` |
| `src/app/page.tsx` | Add `isInitializing`, `isLoopControl` state; rewrite auto-load effect; update render gate; pass `initialTab` |

---

### Task 1: Add `initialTab` prop to `TwoTabLayout`

**Files:**
- Modify: `src/components/layout/two-tab-layout.tsx:8-31`

- [ ] **Step 1: Add `initialTab` to the props interface and wire into `useState`**

In `src/components/layout/two-tab-layout.tsx`, change the props interface from:

```typescript
interface TwoTabLayoutProps {
  codeEditor: React.ReactNode;
  visualDiagram: React.ReactNode;
  fileInfo?: {
    name?: string;
    isDirty?: boolean;
  };
  actions?:
    | React.ReactNode
    | ((
        activeTab: TabType,
        setActiveTab: (tab: TabType) => void,
      ) => React.ReactNode);
}
```

to:

```typescript
interface TwoTabLayoutProps {
  codeEditor: React.ReactNode;
  visualDiagram: React.ReactNode;
  fileInfo?: {
    name?: string;
    isDirty?: boolean;
  };
  initialTab?: TabType;
  actions?:
    | React.ReactNode
    | ((
        activeTab: TabType,
        setActiveTab: (tab: TabType) => void,
      ) => React.ReactNode);
}
```

Then update the component signature and `useState` call:

```typescript
export const TwoTabLayout: React.FC<TwoTabLayoutProps> = ({
  codeEditor,
  visualDiagram,
  fileInfo,
  initialTab,
  actions,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? "code");
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `D:/web-scxml-editor`:
```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/two-tab-layout.tsx
git commit -m "feat(layout): add initialTab prop to TwoTabLayout"
```

---

### Task 2: Add init state to `page.tsx` and wire up LoopControl detection

**Files:**
- Modify: `src/app/page.tsx:51-93`

- [ ] **Step 1: Add `isInitializing` and `isLoopControl` state**

In `src/app/page.tsx`, after the existing state declarations (around line 51–54), add:

```typescript
const [isInitializing, setIsInitializing] = React.useState(true);
const [isLoopControl, setIsLoopControl] = React.useState(false);
```

- [ ] **Step 2: Rewrite the auto-load `useEffect` to set both flags**

Replace the existing auto-load effect (lines 82–93):

```typescript
// Auto-load main.scxml on mount when served via LoopControl
useEffect(() => {
  fetch('/scxml-editor/program')
    .then(r => r.ok ? r.text() : null)
    .then(xml => {
      if (!xml) return;
      setContent(xml);
      setErrors([]);
      historyManager.initialize(xml, 'Auto-loaded');
      navigateToRoot();
    })
    .catch(() => {});
}, []);
```

with:

```typescript
// Auto-load main.scxml on mount when served via LoopControl
useEffect(() => {
  fetch('/scxml-editor/program')
    .then(r => r.ok ? r.text() : null)
    .then(xml => {
      if (!xml) return;
      setIsLoopControl(true);
      setContent(xml);
      setErrors([]);
      historyManager.initialize(xml, 'Auto-loaded');
      navigateToRoot();
    })
    .catch(() => {})
    .finally(() => setIsInitializing(false));
}, []);
```

- [ ] **Step 3: Add the render guard**

In `src/app/page.tsx`, just before the `return (` statement, add:

```typescript
if (isInitializing) return null;
```

- [ ] **Step 4: Pass `initialTab` to `TwoTabLayout`**

Find the `<TwoTabLayout` usage (around line 570) and add the `initialTab` prop:

```tsx
<TwoTabLayout
  codeEditor={renderCodeEditor()}
  visualDiagram={renderVisualDiagram()}
  fileInfo={{
    name: fileInfo?.name,
    isDirty,
  }}
  initialTab={isLoopControl ? "visual" : "code"}
  actions={renderActions}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run from `D:/web-scxml-editor`:
```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Manual verification in LoopControl**

1. Build the editor: `npm run build`
2. Open the LoopControl app and navigate to the SCXML Editor page
3. Hard-refresh the page
4. Expected: no flash of the welcome/upload screen; editor opens directly on the **Visual Diagram** tab

- [ ] **Step 7: Manual verification standalone (regression check)**

1. Run `npm run dev` from `D:/web-scxml-editor`
2. Open `http://localhost:3000` directly (no LoopControl)
3. Expected: welcome screen shows immediately with **Code Editor** as the default tab when a file is loaded

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(page): suppress welcome flash and default to visual tab in LoopControl"
```
