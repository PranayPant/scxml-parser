# Nuxt UI Restyle — Design Spec

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Goal

Restyle the SCXML Editor UI to match the **Nuxt UI component aesthetic** (the look of
the Vue library at ui.nuxt.com): neutral slate palette, a green primary accent, soft
rounded corners, subtle 1px borders over heavy shadows, and consistent spacing.

This project is **Next.js + React + Tailwind CSS v4**, not Nuxt/Vue — so we replicate
the aesthetic with Tailwind rather than adopt the actual (Vue-only) library.

## Decisions

| Topic | Decision |
|---|---|
| Target look | Nuxt UI **component** aesthetic (not the landing page or Pro dashboard) |
| Scope | App shell/chrome **+ deep restyle of all side panels** and their form controls |
| Accent color | Start with **Nuxt green**, exposed as a single swappable `--color-primary` token |
| Theme | **Light + Dark**, system-default with a persisted manual toggle |
| Approach | **Hybrid (C):** token layer + a small set of primitive components, utility sweep elsewhere |
| Canvas/editor in dark mode | "Cheap middle ground" — dark canvas backdrop + dark React Flow controls + Monaco `vs-dark`; node/edge styling untouched |

## Current State (why this work is needed)

There is **no design-token or shared-component layer** today. All 19 styled files
hard-code Tailwind utilities (`bg-blue-100`, `text-gray-700`, etc.) — 217 occurrences.
Consequences: the accent can't be swapped in one place, the look is mildly inconsistent
panel-to-panel, and dark mode is only half-wired (an unused `prefers-color-scheme` block
in `globals.css`).

## Section 1 — Theming Foundation

All in `src/app/globals.css` using Tailwind v4 `@theme` / `@theme inline`.

### Semantic color tokens
Defined as CSS variables in `:root`, overridden under `.dark`, and exposed as Tailwind
utilities so components read tokens — never raw `gray-*`/`blue-*`.

- **Primary (the swap knob):** `--color-primary`, `--color-primary-hover`,
  `--color-primary-muted`, `--color-primary-fg`. Starts Nuxt green (`#00DC82` family).
  Changing the accent later = editing these tokens only.
- **Surfaces / neutrals** (Nuxt-UI-style names): `bg-base`, `bg-elevated` (cards/panels),
  `bg-muted`, `border-default`, `border-muted`, `text-default`, `text-muted`, `text-dimmed`.
- **Status:** `success`, `warning`, `error`, `info` (tokenizes the existing
  green/yellow/red usage in panels and toasts).

### Dark mode mechanism
- Add `@custom-variant dark (&:where(.dark, .dark *))`.
- Toggle a `.dark` class on `<html>`.
- Default to **system preference** on first load; manual toggle persists to
  `localStorage`. Replaces the current unused `prefers-color-scheme` block.
- A small client init (in `layout.tsx` or a tiny theme provider) applies the stored/
  system theme before paint to avoid a flash.

### Radius / spacing
- `--radius` ≈ `0.5rem` → standardize on `rounded-md`/`rounded-lg`.
- Prefer subtle 1px `border-default` borders over heavy shadows.

### Exposed utilities (examples)
`bg-elevated`, `bg-muted`, `text-muted`, `text-dimmed`, `border-default`,
`bg-primary`, `text-primary`, `ring-primary`.

## Section 2 — Primitive Components

New folder `src/components/ui/primitives/`, all token-driven, Nuxt-UI-styled:

- **`Button`** — variants `solid` (primary), `soft`, `ghost`, `outline`; sizes `sm`/`md`;
  optional leading icon + loading spinner. Absorbs the ~dozen ad-hoc button styles in the
  toolbar, the ⋮ menu, and the panels.
- **`Panel`** — the side-panel shell: header (title + close `X`), body, consistent
  width/border/elevation. The four panels currently each re-implement this.
- **`Field` / `Input`** — labeled input + the form-row pattern used across the config,
  channel-mapping, and events panels. Token border + primary focus ring.
- **`Badge` / `StatusDot`** — the validation status dot and count badges, driven by the
  status tokens.

`searchable-select.tsx` remains its own component but is restyled to consume tokens and
the `Field` styling. One-off markup (carousel, breadcrumb, toasts) gets the utility
sweep, not a new component.

## Section 3 — Restyle Scope

**In scope** (token sweep + adopt primitives):
- `src/app/page.tsx` — shell, toolbar actions, ⋮ menu, empty/landing state
- `src/app/loading.tsx`
- `src/components/layout/two-tab-layout.tsx` — toolbar, tab switcher, feedback toasts, breadcrumb
- `src/components/layout/inline-tips-carousel.tsx`
- `src/components/ui/validation-panel.tsx`
- `src/components/ui/config-panel.tsx`
- `src/components/ui/channel-mapping-panel.tsx`
- `src/components/ui/events-panel.tsx`
- `src/components/ui/state-actions-panel.tsx`
- `src/components/ui/searchable-select.tsx`
- `src/components/ui/undo-redo-controls.tsx`
- `src/components/ui/error-boundary.tsx`
- `src/components/file-operations/file-upload.tsx`
- `src/components/file-operations/visual-metadata-export.tsx`

**Left as-is** (canvas internals): React Flow nodes/edges
(`scxml-state-node`, `history-wrapper-node`, `scxml-transition-edge`,
`visual-style-utils.ts`) and Monaco `xml-editor` internals.

**Borderline (canvas overlays):** `transition-edit-bar.tsx`,
`state-actions-edit-bar.tsx`, and `visual-diagram.tsx` controls — tokenize colors for
consistency but keep their structure.

## Section 4 — Dark Mode for Canvas & Editor

Because the diagram canvas and Monaco are out of restyle scope, in dark mode they would
otherwise stay bright inside a dark shell. **Resolution (approved middle ground):**
- React Flow **canvas background + control buttons** get a dark token treatment.
- Monaco switches to its built-in **`vs-dark`** theme when dark mode is active.
- Node/edge styling is left untouched.

> Assumption flagged for review: this interprets the user's "Yes" as accepting the
> recommended middle ground rather than leaving canvas+editor fully light in dark mode.

## Section 5 — Verification

- Manual visual pass in **both themes** (manual toggle + system preference).
- Confirm the accent swaps by editing only `--color-primary`.
- Check focus/hover/disabled states across buttons, fields, and the select.
- Check the empty/landing state and the feedback toasts.
- Run `npm run lint` and `npm run build` clean.

## Out of Scope / YAGNI

- No diagram node/edge restyle.
- No Nuxt UI Pro dashboard layout (sidebar/topbar restructure).
- No new component library dependency.
- No behavioral/functional changes — visual only.
