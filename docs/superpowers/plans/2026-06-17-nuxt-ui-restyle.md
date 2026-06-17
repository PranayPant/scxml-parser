# Nuxt UI Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the SCXML Editor's app shell and side panels to match the Nuxt UI component aesthetic (neutral palette, swappable green primary accent, soft rounded borders), with full light + dark theming.

**Architecture:** Introduce a token layer in `globals.css` (Tailwind v4 `@theme inline` + `@utility`) whose colors flip under a `.dark` class. Add a small set of token-driven primitive components (`Button`, `Panel`, `Field`, `Badge`/`StatusDot`). Refactor chrome + panels to use the primitives and a token utility sweep. Canvas internals stay as-is except a cheap dark treatment (React Flow background/controls + Monaco `vs-dark`).

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, lucide-react, Monaco, React Flow, Zustand.

**Spec:** `docs/superpowers/specs/2026-06-17-nuxt-ui-restyle-design.md`

---

## Methodology Note (read first)

This is a **visual restyle**. There is no meaningful unit test for "matches Nuxt UI," so each task's verification gate is:

1. `npm run lint` — clean (no new errors)
2. `npm run build` — succeeds
3. **Manual visual checkpoint** — run `npm run dev`, view the affected UI in **both** light and dark mode, confirm the described appearance.

Where a task adds real logic (theme persistence), that logic gets exercised in the manual checkpoint with explicit steps. Commit after each task.

---

## Token Mapping Reference (used by all sweep tasks)

When a task says "apply the token mapping," replace raw Tailwind utilities with these token utilities. This table is the single source of truth — do not invent other mappings.

| Old (raw) | New (token) |
|---|---|
| `bg-white` (panels/cards/menus) | `bg-elevated` |
| `bg-gray-50` (subtle headers/footers) | `bg-muted` |
| `bg-gray-100` (inline code, hover fills) | `bg-muted` |
| `bg-gray-50` page background (`page.tsx` root) | `bg-base` |
| `text-gray-900` / `text-gray-800` | `text-default` |
| `text-gray-700` | `text-default` |
| `text-gray-600` / `text-gray-500` | `text-muted` |
| `text-gray-400` | `text-dimmed` |
| `border`, `border-gray-200`, `border-gray-300` | `border border-default` |
| `border-gray-100` | `border-muted` |
| `hover:bg-gray-100` / `hover:bg-gray-50` | `hover:bg-muted` |
| `bg-blue-100 text-blue-700` (active tab/pill) | `bg-primary-muted text-primary` |
| `bg-blue-600` / `bg-blue-500` (solid action) | `bg-primary` |
| `text-blue-600` / `text-blue-700` (links/accents) | `text-primary` |
| `hover:text-blue-800` / `hover:bg-blue-100` | `hover:text-primary-hover` / `hover:bg-primary-muted` |
| `focus:ring-blue-400` / `focus:ring-blue-500` | `focus:ring-primary` |
| `border-blue-500` (active underline) | `border-primary` |
| `text-green-600` (success) | `text-success` |
| `text-yellow-600` / `text-yellow-400` (warning) | `text-warning` |
| `text-red-600` / `text-red-500` (error) | `text-error` |
| `bg-red-500` (status dot error) | `bg-error` |
| `bg-yellow-400` (status dot warn) | `bg-warning` |
| `bg-green-500` (status dot ok) | `bg-success` |

**Leave untouched:** the colored *alert card* backgrounds in `validation-panel.tsx` and the feedback toasts in `two-tab-layout.tsx` (`bg-red-50/border-red-200`, `bg-yellow-50`, `bg-green-50`, `bg-blue-50`) — these are status surfaces; only their dark variants are added in Task 9/10 where noted.

---

## Task 1: Theming foundation in globals.css

**Files:**
- Modify: `src/app/globals.css` (full replacement)

- [ ] **Step 1: Replace `globals.css` with the token layer**

```css
@import 'tailwindcss';

/* Dark mode driven by a `.dark` class on <html> (toggle persisted in localStorage). */
@custom-variant dark (&:where(.dark, .dark *));

/* ------------------------------------------------------------------ */
/* Raw semantic tokens — edit --ui-primary* to swap the accent color.  */
/* ------------------------------------------------------------------ */
:root {
  /* Primary (Nuxt green) */
  --ui-primary: #00dc82;
  --ui-primary-hover: #00c074;
  --ui-primary-muted: #d8fbe8;
  --ui-primary-fg: #043927;

  /* Surfaces */
  --ui-bg: #f9fafb;          /* app background */
  --ui-bg-elevated: #ffffff; /* panels, cards, menus */
  --ui-bg-muted: #f3f4f6;    /* subtle headers/footers/hover */

  /* Borders */
  --ui-border: #e5e7eb;
  --ui-border-muted: #f3f4f6;

  /* Text */
  --ui-text: #111827;
  --ui-text-muted: #6b7280;
  --ui-text-dimmed: #9ca3af;

  /* Status */
  --ui-success: #16a34a;
  --ui-warning: #ca8a04;
  --ui-error: #dc2626;
  --ui-info: #2563eb;
}

.dark {
  --ui-primary: #00dc82;
  --ui-primary-hover: #2be89a;
  --ui-primary-muted: #0b3b2a;
  --ui-primary-fg: #052e16;

  --ui-bg: #09090b;
  --ui-bg-elevated: #18181b;
  --ui-bg-muted: #27272a;

  --ui-border: #3f3f46;
  --ui-border-muted: #27272a;

  --ui-text: #f4f4f5;
  --ui-text-muted: #a1a1aa;
  --ui-text-dimmed: #71717a;

  --ui-success: #4ade80;
  --ui-warning: #facc15;
  --ui-error: #f87171;
  --ui-info: #60a5fa;
}

/* ------------------------------------------------------------------ */
/* Expose primary + status as Tailwind colors (generates bg-/text-/   */
/* ring-/border- utilities). `inline` => utilities reference the vars  */
/* at runtime, so `.dark` overrides take effect.                       */
/* ------------------------------------------------------------------ */
@theme inline {
  --color-primary: var(--ui-primary);
  --color-primary-hover: var(--ui-primary-hover);
  --color-primary-muted: var(--ui-primary-muted);
  --color-primary-fg: var(--ui-primary-fg);
  --color-success: var(--ui-success);
  --color-warning: var(--ui-warning);
  --color-error: var(--ui-error);
  --color-info: var(--ui-info);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

/* ------------------------------------------------------------------ */
/* Surface/text/border utilities. Defined as custom utilities (not    */
/* theme colors) to avoid the bg-/text- name collision on "muted".    */
/* @utility entries support variants (hover:, dark:, focus:).         */
/* ------------------------------------------------------------------ */
@utility bg-base { background-color: var(--ui-bg); }
@utility bg-elevated { background-color: var(--ui-bg-elevated); }
@utility bg-muted { background-color: var(--ui-bg-muted); }
@utility text-default { color: var(--ui-text); }
@utility text-muted { color: var(--ui-text-muted); }
@utility text-dimmed { color: var(--ui-text-dimmed); }
@utility border-default { border-color: var(--ui-border); }
@utility border-muted { border-color: var(--ui-border-muted); }

body {
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}

/* Override ReactFlow's default group node styles */
.react-flow__node-group {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.react-flow__node-group > div:first-child {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
}

button:hover {
  cursor: pointer;
}
```

- [ ] **Step 2: Verify build picks up the utilities**

Run: `npm run build`
Expected: build succeeds. (If `@utility` or `@custom-variant` errors, confirm `tailwindcss` v4 is installed — `package.json` shows `"tailwindcss": "^4"`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): add Nuxt UI token layer with dark mode + swappable primary"
```

---

## Task 2: Theme persistence + toggle

Adds the runtime that flips `.dark` on `<html>`: a pre-paint init script (no flash), a tiny helper module, and a `ThemeToggle` button.

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/lib/theme/theme.ts`
- Create: `src/components/ui/theme-toggle.tsx`

- [ ] **Step 1: Add the pre-paint init script to `layout.tsx`**

In `src/app/layout.tsx`, add a second `<script>` immediately after the existing `ScxmlEditorAPI` stub script (inside `<body>`, before `{children}`):

```tsx
        {/* Apply persisted/system theme before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();` }} />
```

- [ ] **Step 2: Create the theme helper**

`src/lib/theme/theme.ts`:

```ts
export type Theme = 'light' | 'dark';

export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* ignore storage failures (private mode) */
  }
}
```

- [ ] **Step 3: Create the toggle component**

`src/components/ui/theme-toggle.tsx`:

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, getInitialTheme, type Theme } from '@/lib/theme/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  // Sync state to whatever the pre-paint script already applied.
  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label='Toggle theme'
      className='p-2 rounded-md text-muted hover:bg-muted hover:text-default transition-colors'
    >
      {theme === 'dark' ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
    </button>
  );
}
```

- [ ] **Step 4: Export from the ui barrel**

Check `src/components/ui/index.ts` (the import in `page.tsx` uses `@/components/ui`). Add:

```ts
export { ThemeToggle } from './theme-toggle';
```

(If no barrel file exists, skip — `page.tsx` will import from the direct path in Task 9.)

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/lib/theme/theme.ts src/components/ui/theme-toggle.tsx src/components/ui/index.ts
git commit -m "feat(theme): add theme persistence helper and toggle button"
```

*(The toggle is wired into the toolbar in Task 8; visual check happens there.)*

---

## Task 3: Button primitive

**Files:**
- Create: `src/components/ui/primitives/button.tsx`

- [ ] **Step 1: Create `button.tsx`**

```tsx
'use client';

import React from 'react';

type Variant = 'solid' | 'soft' | 'ghost' | 'outline';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT: Record<Variant, string> = {
  solid: 'bg-primary text-primary-fg hover:bg-primary-hover',
  soft: 'bg-primary-muted text-primary hover:bg-primary-muted/70',
  ghost: 'text-muted hover:bg-muted hover:text-default',
  outline: 'border border-default text-default hover:bg-muted',
};

const SIZE: Record<Size, string> = {
  sm: 'text-xs px-2 py-1.5 gap-1',
  md: 'text-sm px-3 py-2 gap-2',
};

export function Button({
  variant = 'solid',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className='h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin' />
      )}
      {!loading && icon}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/primitives/button.tsx
git commit -m "feat(ui): add Button primitive"
```

---

## Task 4: Panel primitive

**Files:**
- Create: `src/components/ui/primitives/panel.tsx`

- [ ] **Step 1: Create `panel.tsx`**

```tsx
'use client';

import React from 'react';
import { X } from 'lucide-react';

interface PanelProps {
  title: string;
  onClose?: () => void;
  /** Tailwind width class for the panel shell. Defaults to w-80. */
  widthClass?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Panel({
  title,
  onClose,
  widthClass = 'w-80',
  footer,
  children,
  className = '',
}: PanelProps) {
  return (
    <div
      className={`${widthClass} flex flex-col border border-default rounded-lg bg-elevated shadow-sm h-full overflow-hidden ${className}`}
    >
      <div className='flex items-center justify-between px-3 py-2 border-b border-default bg-muted'>
        <span className='text-sm font-semibold text-default'>{title}</span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label='Close panel'
            className='text-dimmed hover:text-default transition-colors'
          >
            <X className='h-4 w-4' />
          </button>
        )}
      </div>
      <div className='flex-1 overflow-y-auto'>{children}</div>
      {footer && (
        <div className='px-3 py-2 border-t border-default bg-muted'>{footer}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/primitives/panel.tsx
git commit -m "feat(ui): add Panel primitive"
```

---

## Task 5: Field / Input primitive

**Files:**
- Create: `src/components/ui/primitives/field.tsx`

- [ ] **Step 1: Create `field.tsx`**

```tsx
'use client';

import React from 'react';

export const inputClass =
  'w-full border border-default rounded px-2 py-1 text-xs text-default bg-elevated placeholder:text-dimmed focus:outline-none focus:ring-1 focus:ring-primary';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...rest }, ref) => (
    <input ref={ref} className={`${inputClass} ${className}`} {...rest} />
  ),
);
Input.displayName = 'Input';

interface FieldProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, children, className = '' }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className={`block space-y-1 ${className}`}>
      <span className='text-xs font-medium text-muted'>{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/primitives/field.tsx
git commit -m "feat(ui): add Field and Input primitives"
```

---

## Task 6: Badge / StatusDot primitive + barrel

**Files:**
- Create: `src/components/ui/primitives/badge.tsx`
- Create: `src/components/ui/primitives/index.ts`

- [ ] **Step 1: Create `badge.tsx`**

```tsx
'use client';

import React from 'react';

type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const DOT: Record<Status, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  neutral: 'bg-[var(--ui-text-dimmed)]',
};

export function StatusDot({ status }: { status: Status }) {
  return <span className={`block w-2.5 h-2.5 rounded-full ${DOT[status]}`} />;
}

const BADGE: Record<Status, string> = {
  success: 'bg-primary-muted text-primary',
  warning: 'bg-[var(--ui-warning)]/15 text-warning',
  error: 'bg-[var(--ui-error)]/15 text-error',
  info: 'bg-[var(--ui-info)]/15 text-info',
  neutral: 'bg-muted text-muted',
};

export function Badge({
  status = 'neutral',
  children,
}: {
  status?: Status;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Create the primitives barrel `index.ts`**

```ts
export { Button } from './button';
export { Panel } from './panel';
export { Field, Input, inputClass } from './field';
export { Badge, StatusDot } from './badge';
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/primitives/badge.tsx src/components/ui/primitives/index.ts
git commit -m "feat(ui): add Badge/StatusDot primitives and primitives barrel"
```

---

## Task 7: Restyle the toolbar (`two-tab-layout.tsx`) + add theme toggle

**Files:**
- Modify: `src/components/layout/two-tab-layout.tsx`

- [ ] **Step 1: Apply the token mapping to the toolbar container and tabs**

Replace the toolbar container and the two tab buttons. Change:

```tsx
      <div className='flex items-center gap-1 px-3 py-2 border-b bg-white'>
```
to:
```tsx
      <div className='flex items-center gap-1 px-3 py-2 border-b border-default bg-elevated'>
```

For both tab buttons, change the active/inactive classes from:
```tsx
          className={`p-2 rounded-md transition-colors ${
            activeTab === "visual"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          }`}
```
to (same for the `"code"` button with its own condition):
```tsx
          className={`p-2 rounded-md transition-colors ${
            activeTab === "visual"
              ? "bg-primary-muted text-primary"
              : "text-muted hover:bg-muted hover:text-default"
          }`}
```

- [ ] **Step 2: Token-sweep the remaining toolbar bits**

Apply the Token Mapping Reference to: the host-command divider (`bg-gray-200` → `bg-default`), the host-command buttons (`bg-indigo-50 text-indigo-700 hover:bg-indigo-100` → `bg-primary-muted text-primary hover:bg-primary-muted/70`, spinner border → `border-primary`), the breadcrumb dividers/`Home`/chevrons/segments (`text-gray-400` → `text-dimmed`, `text-gray-500/700` → `text-muted`/`text-default`, `bg-gray-200` → `bg-default`), and the kbd chips in `editorTips` (`bg-gray-200 ... text-gray-700` → `bg-muted ... text-default`, apply to all occurrences).

- [ ] **Step 3: Add dark variants to the feedback toasts**

The toast keeps its colored status surface but needs dark variants. Change the level class block to:

```tsx
            item.level === "info"
              ? "bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-800 dark:text-green-300"
              : item.level === "warning"
                ? "bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900 text-yellow-800 dark:text-yellow-300"
                : "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300"
```

- [ ] **Step 4: Add the ThemeToggle to the toolbar**

Add the import at the top:
```tsx
import { ThemeToggle } from "@/components/ui/theme-toggle";
```
Insert `<ThemeToggle />` immediately before the `{actions && ...}` block (after the `InlineTipsCarousel`):
```tsx
        <ThemeToggle />

        {actions &&
```

- [ ] **Step 5: Token-sweep the content area**

Change:
```tsx
        {activeTab === "code" && (
          <div className='h-full p-4 bg-white'>{codeEditor}</div>
        )}
        {activeTab === "visual" && (
          <div className='h-full bg-gray-100'>{visualDiagram}</div>
        )}
```
to:
```tsx
        {activeTab === "code" && (
          <div className='h-full p-4 bg-base'>{codeEditor}</div>
        )}
        {activeTab === "visual" && (
          <div className='h-full bg-muted'>{visualDiagram}</div>
        )}
```

- [ ] **Step 6: Verify (visual checkpoint)**

Run: `npm run lint && npm run dev`
Open the app with a document loaded. Confirm: toolbar is white (light) / dark (dark), active tab uses green-tinted pill, theme toggle flips the whole shell, toasts (trigger one via a host command if available, otherwise skip) read correctly in both modes.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/two-tab-layout.tsx
git commit -m "feat(theme): restyle toolbar and wire theme toggle"
```

---

## Task 8: Restyle `page.tsx` (shell, toolbar actions, ⋮ menu, empty state)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Root + loading + empty-state containers**

- Root: `min-h-screen bg-gray-50 overflow-hidden` → `min-h-screen bg-base overflow-hidden`.
- Loading wrapper: `bg-gray-50` → `bg-base`; spinner `border-blue-500` → `border-primary`.
- Empty-state heading `text-gray-900` → `text-default`; paragraph `text-gray-600` → `text-muted`.
- Cards `bg-white rounded-lg shadow-sm p-6` → `bg-elevated border border-default rounded-lg shadow-sm p-6` (all occurrences).
- "Getting Started"/"Features" headings `text-gray-900` → `text-default`; body `text-gray-600` → `text-muted`.
- Numbered step bubbles `bg-blue-100 text-blue-600` → `bg-primary-muted text-primary` (all four).
- "create a new one" link `text-blue-600 hover:text-blue-800` → `text-primary hover:text-primary-hover`.
- Feature bullet dots `bg-green-500` → `bg-success`.

- [ ] **Step 2: Status dot button (renderActions)**

Replace the validation status `<span>` with the `StatusDot` primitive. Add import:
```tsx
import { StatusDot } from '@/components/ui/primitives';
```
Change the status button's inner span from the inline `className={...bg-red-500...bg-green-500}` to:
```tsx
        <StatusDot status={hasErrors ? 'error' : hasWarnings ? 'warning' : 'success'} />
```
Change the button wrapper `hover:bg-gray-100` → `hover:bg-muted`, and the divider `bg-gray-200` → `bg-default`.

- [ ] **Step 3: ⋮ More menu**

- Trigger button: `text-gray-500 hover:bg-gray-100 hover:text-gray-700` → `text-muted hover:bg-muted hover:text-default`.
- Dropdown container: `bg-white border border-gray-200` → `bg-elevated border border-default`.
- Menu items: `text-gray-700 hover:bg-gray-50` → `text-default hover:bg-muted`; item icons `text-gray-500` → `text-muted`.

- [ ] **Step 4: Verify (visual checkpoint)**

Run: `npm run lint && npm run dev`
With NO document loaded, confirm the empty/landing state: cards have subtle borders, numbered bubbles and the link are green, everything readable in dark mode. Then load a doc and open the ⋮ menu — confirm menu surface/hover tokens in both themes. Confirm the status dot color.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(theme): restyle app shell, actions, and empty state"
```

---

## Task 9: Restyle `validation-panel.tsx`

**Files:**
- Modify: `src/components/ui/validation-panel.tsx`

- [ ] **Step 1: Adopt the Panel-style shell tokens**

This panel renders inline (not full-height), so keep its own wrapper but tokenize. Change the outer `bg-white border rounded-lg shadow-sm` → `bg-elevated border border-default rounded-lg shadow-sm`. Heading `text-gray-900` → `text-default`. Close button `text-gray-400 hover:text-gray-600` → `text-dimmed hover:text-default`.

- [ ] **Step 2: Tabs**

For both tab buttons, active `border-blue-500 text-blue-600` → `border-primary text-primary`; inactive `border-transparent text-gray-500 hover:text-gray-700` → `border-transparent text-muted hover:text-default`. Tab container `border-b` → `border-b border-default`.

- [ ] **Step 3: Status text + "Clear all"**

`text-green-600` (no-issues rows) → `text-success`. `text-red-600`/`text-yellow-600` count rows → `text-error`/`text-warning`. "Clear all" `text-gray-500 hover:text-gray-700` → `text-muted hover:text-default`.

- [ ] **Step 4: Alert cards — add dark variants**

In `HostErrorCard` and `ValidationErrorItem`, the colored cards need dark variants. Update each color triple:

`HostErrorCard` `containerClass`:
```tsx
  const containerClass = isError
    ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
    : isWarning
      ? 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-900'
      : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900';
  const textClass = isError ? 'text-red-800 dark:text-red-300' : isWarning ? 'text-yellow-800 dark:text-yellow-300' : 'text-blue-800 dark:text-blue-300';
```
The dismiss `X` button: `text-gray-400 hover:text-gray-600` → `text-dimmed hover:text-default`.

`ValidationErrorItem` container:
```tsx
        isError ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900' : 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-900'
```
Leave the inner `text-red-800`/`text-red-600`/`text-red-500` (and yellow) text classes but append dark variants on the two primary message/line lines: add `dark:text-red-300` / `dark:text-yellow-300` to the `font-medium` message `<p>`, and `dark:text-red-400` / `dark:text-yellow-400` to the line/column `<p>`. (Icons may stay as-is.)

- [ ] **Step 5: Verify (visual checkpoint)**

Run: `npm run lint && npm run dev`
Load a doc with a deliberate error (e.g. delete a closing tag), open the validation panel via the status dot. Confirm error/warning cards are readable in both themes and tab underline is green.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/validation-panel.tsx
git commit -m "feat(theme): restyle validation panel with tokens and dark variants"
```

---

## Task 10: Restyle the form panels (config, channel-mapping, events, state-actions)

Each of these full-height panels currently re-implements the panel shell. Refactor each to use the `Panel` primitive and apply the token mapping inside.

**Files:**
- Modify: `src/components/ui/config-panel.tsx`
- Modify: `src/components/ui/channel-mapping-panel.tsx`
- Modify: `src/components/ui/events-panel.tsx`
- Modify: `src/components/ui/state-actions-panel.tsx`

- [ ] **Step 1: config-panel.tsx — swap shell to `Panel`**

Add import: `import { Panel } from '@/components/ui/primitives';`
Replace the outer `<div className='w-80 ...'>` + header + footer scaffolding with `Panel`. Concretely, replace lines from the outer wrapper through the `</div>` close so the structure becomes:

```tsx
  return (
    <Panel
      title='Config Values'
      onClose={onClose}
      footer={
        !isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-default text-muted hover:border-primary hover:text-primary transition-colors'
          >
            <Plus className='h-3 w-3' />
            Add config
          </button>
        ) : undefined
      }
    >
      {/* existing inner content: the empty-state block OR the <table> */}
    </Panel>
  );
```
Note: `Panel` already provides the `flex-1 overflow-y-auto` body wrapper, so drop the old `<div className='flex-1 overflow-y-auto'>` wrapper and place its children directly inside `Panel`.

- [ ] **Step 2: config-panel.tsx — token-sweep the body**

Apply the Token Mapping Reference: empty-state text `text-gray-500/400` → `text-muted/dimmed`, inline `<code>` `bg-gray-100` → `bg-muted`; table header `bg-gray-50 border-b` → `bg-muted border-b border-default`, `text-gray-600` → `text-muted`; rows `border-b hover:bg-gray-50` → `border-b border-default hover:bg-muted`, cell text `text-gray-800` → `text-default`; the type span `text-blue-600` → `text-primary`; the add-row `bg-blue-50` → `bg-primary-muted`, `text-gray-400` → `text-dimmed`. Replace every `<input ... className='w-full border rounded ... focus:ring-blue-400'>` with the shared `inputClass` (import `inputClass` from `@/components/ui/primitives` and use `className={inputClass}`). Confirm/cancel buttons: `text-green-600 hover:bg-green-100` → `text-success hover:bg-primary-muted`; cancel `text-gray-400 hover:bg-gray-100` → `text-dimmed hover:bg-muted`.

- [ ] **Step 3: channel-mapping-panel, events-panel, state-actions-panel**

For each: read the file, swap the outer shell to `Panel` (title = the panel's current header text, pass `onClose`, move any footer action into the `footer` prop), then apply the Token Mapping Reference across the body and replace bespoke inputs with `inputClass`. These three follow the exact same structure as config-panel — there are no new patterns. Pay attention to any blue active/selected states → `primary`, any `bg-white` inner cards → `bg-elevated`, and any status colors → status tokens.

- [ ] **Step 4: Verify (visual checkpoint)**

Run: `npm run lint && npm run dev`
Open each panel (config via host stub or the relevant toggle; events/channel via their toggles). Confirm: consistent header/footer chrome across all four, inputs have green focus ring, readable in both themes, no leftover blue.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/config-panel.tsx src/components/ui/channel-mapping-panel.tsx src/components/ui/events-panel.tsx src/components/ui/state-actions-panel.tsx
git commit -m "feat(theme): restyle form panels on Panel/Field primitives"
```

---

## Task 11: Restyle remaining chrome components

**Files:**
- Modify: `src/components/ui/searchable-select.tsx`
- Modify: `src/components/ui/undo-redo-controls.tsx`
- Modify: `src/components/layout/inline-tips-carousel.tsx`
- Modify: `src/components/ui/error-boundary.tsx`
- Modify: `src/app/loading.tsx`
- Modify: `src/components/file-operations/file-upload.tsx`
- Modify: `src/components/file-operations/visual-metadata-export.tsx`

- [ ] **Step 1: Apply the Token Mapping Reference to each file**

Read each file and apply the mapping. Specific notes:
- `searchable-select.tsx`: dropdown surface `bg-white` → `bg-elevated`, borders → `border-default`, hover/highlight rows `bg-gray-100`/`bg-blue-50` → `bg-muted`/`bg-primary-muted`, selected text `text-blue-600` → `text-primary`, the input → `inputClass` where it fits. Keep search behavior unchanged.
- `undo-redo-controls.tsx`: buttons `text-gray-500 hover:bg-gray-100 ... disabled:text-gray-300` → `text-muted hover:bg-muted ... disabled:text-dimmed`.
- `inline-tips-carousel.tsx`: container/text grays → tokens; any accent → `text-primary`.
- `error-boundary.tsx`: card `bg-white` → `bg-elevated`, text grays → tokens, any retry button to `Button` primitive (`variant='solid'`) or `bg-primary`.
- `loading.tsx`: background `bg-gray-50` → `bg-base`; spinner `border-blue-500` → `border-primary`.
- `file-upload.tsx`: dropzone border/`bg-white`/`text-gray-*`/`text-blue-*` → token equivalents; active drag state blue → `primary`.
- `visual-metadata-export.tsx`: single occurrence — swap to token.

- [ ] **Step 2: Verify (visual checkpoint)**

Run: `npm run lint && npm run dev`
Exercise: undo/redo buttons (disabled + enabled states), the tips carousel, the file-upload dropzone on the empty state, and a searchable-select (inside a panel). Confirm both themes.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/searchable-select.tsx src/components/ui/undo-redo-controls.tsx src/components/layout/inline-tips-carousel.tsx src/components/ui/error-boundary.tsx src/app/loading.tsx src/components/file-operations/file-upload.tsx src/components/file-operations/visual-metadata-export.tsx
git commit -m "feat(theme): restyle remaining chrome components with tokens"
```

---

## Task 12: Dark treatment for canvas + Monaco editor

The canvas internals and Monaco stay structurally as-is, but get a dark backdrop so they don't glare inside a dark shell.

**Files:**
- Modify: `src/components/editor/xml-editor.tsx`
- Modify: `src/app/page.tsx` (pass theme to `XMLEditor`)
- Modify: `src/components/diagram/visual-diagram.tsx` (Background/Controls + canvas className)

- [ ] **Step 1: Make `XMLEditor` follow the app theme**

`xml-editor.tsx` already accepts a `theme` prop and maps `'dark' → 'vs-dark'`. The default is `'dark'`; we want it to follow the app. In `page.tsx`'s `renderCodeEditor`, pass the current theme. Add near the top of `Home` (after other hooks):

```tsx
  const [isDark, setIsDark] = React.useState(false);
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
```
Then in `renderCodeEditor`, pass `theme={isDark ? 'dark' : 'light'}` to `<XMLEditor>`.

- [ ] **Step 2: React Flow Background + canvas gradient follow theme**

In `visual-diagram.tsx`, the `ReactFlow` has `className='bg-gradient-to-br from-slate-50 to-slate-100'`. Change to include dark variants:
```tsx
            className='bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-900 dark:to-zinc-950'
```
For `<Background color='#cbd5e1' ... />`, make the dot color theme-aware. Add a `useState`/observer like Step 1 *or* reuse a prop. Minimal approach — read the class at render is unreliable; instead compute once with an observer local to this component:
```tsx
  const [canvasDark, setCanvasDark] = useState(false);
  useEffect(() => {
    const update = () => setCanvasDark(document.documentElement.classList.contains('dark'));
    update();
    const o = new MutationObserver(update);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, []);
```
Then: `<Background color={canvasDark ? '#3f3f46' : '#cbd5e1'} gap={20} size={1} variant={BackgroundVariant.Dots} />`.

- [ ] **Step 3: React Flow Controls dark styling**

React Flow `Controls` render light by default. Add a scoped CSS override to `globals.css` (append at the end):
```css
.dark .react-flow__controls {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
}
.dark .react-flow__controls-button {
  background: var(--ui-bg-elevated);
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  fill: var(--ui-text-muted);
}
.dark .react-flow__controls-button:hover {
  background: var(--ui-bg-muted);
}
```
And the custom `ControlButton` `className='text-gray-600 hover:text-gray-900'` → `text-muted hover:text-default`.

- [ ] **Step 4: Verify (visual checkpoint)**

Run: `npm run lint && npm run dev`
Toggle dark mode. Confirm: code editor switches to `vs-dark` in dark / `vs` in light; diagram canvas backdrop is dark with subtle dots; React Flow control buttons are dark and legible. Node/edge styling intentionally unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/xml-editor.tsx src/app/page.tsx src/components/diagram/visual-diagram.tsx src/app/globals.css
git commit -m "feat(theme): dark treatment for Monaco editor and React Flow canvas"
```

---

## Task 13: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Lint + build**

Run: `npm run lint && npm run build`
Expected: both clean.

- [ ] **Step 2: Accent-swap smoke test**

In `globals.css`, temporarily change `:root { --ui-primary: ... }` to a distinct color (e.g. `#7c3aed`). Run `npm run dev`, confirm buttons/links/tabs/focus rings all change together. **Revert** to the Nuxt green.

- [ ] **Step 3: Full theme sweep**

With `npm run dev`: walk through empty state, code tab, visual tab, every panel, the ⋮ menu, validation errors, and the theme toggle — in **both** light and dark. Note any missed raw `gray-*`/`blue-*` (search the in-scope files with `grep -rn "blue-\|gray-" src/components/ui src/components/layout src/app` and triage any remaining against the mapping). Fix stragglers.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(theme): clean up remaining raw color utilities"
```

---

## Self-Review Notes (author)

- **Spec coverage:** Section 1 → Task 1; dark mechanism/toggle → Task 2; primitives (Section 2) → Tasks 3–6; chrome+panel sweep (Section 3) → Tasks 7–11; canvas/Monaco dark (Section 4) → Task 12; verification (Section 5) → Task 13 (incl. accent-swap test).
- **Type consistency:** primitives export names (`Button`, `Panel`, `Field`, `Input`, `inputClass`, `Badge`, `StatusDot`) are defined in Tasks 3–6 and consumed in Tasks 8–11 under the same names. `Theme`/`getInitialTheme`/`applyTheme` defined in Task 2, consumed by `ThemeToggle` in the same task.
- **Known soft spots for the implementer:** the three form panels in Task 10 Step 3 and the seven files in Task 11 are swept by reference to the mapping table rather than full code, because they repeat patterns already shown in detail for config-panel/validation-panel. Read each before editing; the mapping table is authoritative.
