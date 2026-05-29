# SCXML Authoring Issue Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 new validation rules to the SCXML editor that detect C# code-generation incompatibilities before they cause compile/runtime failures.

**Architecture:** Each validation category gets its own module file under `src/lib/validators/`. New modules are registered in `SCXMLValidator.validate()` in `scxml-validator.ts`.

**Tech Stack:** TypeScript 5, Next.js 15, existing `fast-xml-parser` parsed AST (`@_` attribute prefix convention).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/validators/event-identifier-validator.ts` | Problems 1, 2, 3, 7 — event name rules |
| Modify | `src/lib/validators/transition-validator.ts` | Problem 4 — `initial` must reference a direct child |
| Create | `src/lib/validators/datamodel-validator.ts` | Problems 5 & 6 — assign/datamodel consistency |
| Modify | `src/lib/validators/scxml-validator.ts` | Wire new validators into `validate()` |

---

## Task 1 — Event Identifier Validator (Problems 1, 2, 3, 7)

**Files:**
- Create: `src/lib/validators/event-identifier-validator.ts`

### Background

The SCXML editor targets a C# code generator that uses event names directly as C# identifiers. Four classes of bad event names must be detected:

1. **Empty** (`event=""`): Produces an empty C# identifier.
2. **C# keyword** (`event="event"`, `event="class"`): Reserved words are illegal as identifiers.
3. **Starts with digit** (`event="1"`, `event="3phase"`): C# identifiers cannot start with a digit.
4. **Readable-string collision**: The generator transforms event names to human-readable strings by replacing all non-alphanumeric characters with spaces and collapsing consecutive spaces. Two distinct events that produce the same readable string cause a duplicate-key exception at runtime.

- [ ] **Step 1: Create `src/lib/validators/event-identifier-validator.ts`**

```typescript
import type { SCXMLElement, StateElement, ParallelElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';

const CSHARP_KEYWORDS = new Set([
  'abstract','as','base','bool','break','byte','case','catch','char','checked',
  'class','const','continue','decimal','default','delegate','do','double','else',
  'enum','event','explicit','extern','false','finally','fixed','float','for',
  'foreach','goto','if','implicit','in','int','interface','internal','is','lock',
  'long','namespace','new','null','object','operator','out','override','params',
  'private','protected','public','readonly','ref','return','sbyte','sealed',
  'short','sizeof','stackalloc','static','string','struct','switch','this',
  'throw','true','try','typeof','uint','ulong','unchecked','unsafe','ushort',
  'using','virtual','void','volatile','while',
]);

function toReadableString(event: string): string {
  return event.replace(/[^a-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function collectAllEventNames(
  element: SCXMLElement | StateElement | ParallelElement,
  out: string[]
): void {
  if ((element as any).transition) {
    const transitions = Array.isArray((element as any).transition)
      ? (element as any).transition
      : [(element as any).transition];
    transitions.forEach((t: any) => {
      if (t['@_event'] !== undefined) {
        const names = (t['@_event'] as string).split(/\s+/).filter(Boolean);
        out.push(...names);
      }
    });
  }
  for (const key of ['state', 'parallel', 'final'] as const) {
    if ((element as any)[key]) {
      const children = Array.isArray((element as any)[key])
        ? (element as any)[key]
        : [(element as any)[key]];
      children.forEach((child: any) => collectAllEventNames(child, out));
    }
  }
}

function validateSingleEvent(event: string, errors: ValidationError[]): void {
  if (event === '') {
    errors.push({
      message: `Empty event name (event="") is not valid. Remove the 'event' attribute entirely for unconditional completion transitions.`,
      severity: 'error',
    });
    return;
  }

  if (/^\d/.test(event)) {
    errors.push({
      message: `Event name '${event}' starts with a digit, which is not a valid C# identifier. Prefix with a letter or underscore (e.g. 'phase_${event}').`,
      severity: 'error',
    });
    return;
  }

  if (CSHARP_KEYWORDS.has(event)) {
    errors.push({
      message: `Event name '${event}' is a reserved C# keyword and cannot be used as an identifier. Rename it (e.g. '${event}_trigger').`,
      severity: 'error',
    });
  }
}

function validateReadableStringCollisions(
  allEvents: string[],
  errors: ValidationError[]
): void {
  const uniqueEvents = [...new Set(allEvents)];
  const readableMap = new Map<string, string[]>();

  uniqueEvents.forEach((event) => {
    const readable = toReadableString(event);
    if (!readableMap.has(readable)) readableMap.set(readable, []);
    readableMap.get(readable)!.push(event);
  });

  readableMap.forEach((events, readable) => {
    if (events.length > 1) {
      errors.push({
        message: `Events ${events.map((e) => `'${e}'`).join(' and ')} produce the same readable string "${readable}" after cleanup. This causes a duplicate-key runtime exception. Rename them to semantically distinct identifiers.`,
        severity: 'error',
      });
    }
  });
}

export function validateEventIdentifiers(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  const allEvents: string[] = [];
  collectAllEventNames(scxml, allEvents);

  allEvents.forEach((event) => validateSingleEvent(event, errors));
  validateReadableStringCollisions(allEvents, errors);
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators/event-identifier-validator.ts
git commit -m "feat: validate event names for C# codegen compatibility (empty, keyword, digit, collision)"
```

---

## Task 2 — Fix `initial` Attribute to Validate Direct Children (Problem 4)

**Files:**
- Modify: `src/lib/validators/transition-validator.ts`

### Background

The existing `validateInitialStates` only checks the first level of states and validates `@_initial` against the global state-ID set. This misses two cases:
- Nested compound states deeper than one level.
- An `@_initial` value that exists elsewhere in the document but is not a direct child of the compound state.

The new function checks that each compound state's `@_initial` references only its own direct children.

- [ ] **Step 1: Append `validateInitialAttributeTargetsChild` to `transition-validator.ts`**

Add to the end of `src/lib/validators/transition-validator.ts`:

```typescript
function collectDirectChildIds(
  element: StateElement | ParallelElement
): Set<string> {
  const ids = new Set<string>();
  for (const key of ['state', 'parallel', 'final', 'history'] as const) {
    if ((element as any)[key]) {
      const children = Array.isArray((element as any)[key])
        ? (element as any)[key]
        : [(element as any)[key]];
      children.forEach((c: any) => {
        if (c['@_id']) ids.add(c['@_id']);
      });
    }
  }
  return ids;
}

export function validateInitialAttributeTargetsChild(
  element: SCXMLElement | StateElement | ParallelElement,
  errors: ValidationError[]
): void {
  const childStates: StateElement[] = [];
  if ((element as any).state) {
    const states = Array.isArray((element as any).state)
      ? (element as any).state
      : [(element as any).state];
    childStates.push(...states);
  }

  childStates.forEach((state) => {
    if (state['@_initial']) {
      const directChildIds = collectDirectChildIds(state);
      state['@_initial'].split(/\s+/).forEach((ref) => {
        if (ref && !directChildIds.has(ref)) {
          errors.push({
            message: `Initial state '${ref}' in state '${state['@_id']}' is not a direct child of that state. Correct the typo so the 'initial' value matches an actual child state id.`,
            severity: 'error',
          });
        }
      });
    }
    validateInitialAttributeTargetsChild(state, errors);
  });

  if ((element as any).parallel) {
    const parallels = Array.isArray((element as any).parallel)
      ? (element as any).parallel
      : [(element as any).parallel];
    parallels.forEach((p: ParallelElement) =>
      validateInitialAttributeTargetsChild(p, errors)
    );
  }
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators/transition-validator.ts
git commit -m "feat: validate initial attribute references direct child state (Problem 4)"
```

---

## Task 3 — Datamodel Validator (Problems 5 & 6)

**Files:**
- Create: `src/lib/validators/datamodel-validator.ts`

### Background

Two assign-related issues must be detected:

- **Problem 5**: An `<assign location="x" .../>` references a variable `x` that has no `<data id="x" .../>` declaration in any `<datamodel>`. The warning is only emitted when at least one `<data>` declaration exists in the document — if there is no datamodel at all we cannot distinguish "intentionally binding-less" from "forgot to declare".
- **Problem 6**: An `<assign location="oven*" .../>` uses a wildcard `*`. The `*` is not a valid C# identifier character and the generator does not support wildcard locations.

**How fast-xml-parser stores assign elements:** Within `<onentry>` and `<onexit>`, actions appear as direct properties of the parsed object (e.g., `onentry.assign`). This is consistent with how `w3c-validator.ts` accesses them via `element['assign']`.

- [ ] **Step 1: Create `src/lib/validators/datamodel-validator.ts`**

```typescript
import type { SCXMLElement, StateElement, ParallelElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';

function collectDeclaredVariables(
  element: SCXMLElement | StateElement | ParallelElement,
  declared: Set<string>
): void {
  if ((element as any).datamodel?.data) {
    const data = Array.isArray((element as any).datamodel.data)
      ? (element as any).datamodel.data
      : [(element as any).datamodel.data];
    data.forEach((d: any) => {
      if (d['@_id']) declared.add(d['@_id']);
    });
  }
  for (const key of ['state', 'parallel'] as const) {
    if ((element as any)[key]) {
      const children = Array.isArray((element as any)[key])
        ? (element as any)[key]
        : [(element as any)[key]];
      children.forEach((c: any) => collectDeclaredVariables(c, declared));
    }
  }
}

function collectAssignLocations(
  element: SCXMLElement | StateElement | ParallelElement,
  locations: string[]
): void {
  for (const actionContainer of ['onentry', 'onexit'] as const) {
    if ((element as any)[actionContainer]) {
      const containers = Array.isArray((element as any)[actionContainer])
        ? (element as any)[actionContainer]
        : [(element as any)[actionContainer]];
      containers.forEach((container: any) => {
        if (container.assign) {
          const assigns = Array.isArray(container.assign)
            ? container.assign
            : [container.assign];
          assigns.forEach((a: any) => {
            if (a['@_location'] !== undefined) locations.push(a['@_location']);
          });
        }
      });
    }
  }
  for (const key of ['state', 'parallel'] as const) {
    if ((element as any)[key]) {
      const children = Array.isArray((element as any)[key])
        ? (element as any)[key]
        : [(element as any)[key]];
      children.forEach((c: any) => collectAssignLocations(c, locations));
    }
  }
}

export function validateDatamodelConsistency(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  const declared = new Set<string>();
  collectDeclaredVariables(scxml, declared);

  const assignLocations: string[] = [];
  collectAssignLocations(scxml, assignLocations);

  assignLocations.forEach((location) => {
    if (location.includes('*')) {
      errors.push({
        message: `Wildcard '*' in <assign location="${location}"> is not supported by the C# code generator. Replace with explicit individual assignments for each affected field.`,
        severity: 'error',
      });
      return;
    }
    if (declared.size > 0 && !declared.has(location)) {
      errors.push({
        message: `Variable '${location}' used in <assign> is not declared in any <datamodel>. Add <data id="${location}" expr="0"/> to the <datamodel> element.`,
        severity: 'warning',
      });
    }
  });
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators/datamodel-validator.ts
git commit -m "feat: validate assign locations against datamodel declarations and reject wildcards (Problems 5, 6)"
```

---

## Task 4 — Wire New Validators into `SCXMLValidator`

**Files:**
- Modify: `src/lib/validators/scxml-validator.ts`

- [ ] **Step 1: Add imports**

In `src/lib/validators/scxml-validator.ts`, add to the existing import block after the `transition-validator` import:

```typescript
import { validateEventIdentifiers } from './event-identifier-validator';
import { validateInitialAttributeTargetsChild } from './transition-validator';
import { validateDatamodelConsistency } from './datamodel-validator';
```

- [ ] **Step 2: Call new validators inside `validate()`**

In `SCXMLValidator.validate()`, append three calls just before the `return deduplicateErrors(errors)` line:

```typescript
    // C# codegen compatibility checks
    validateEventIdentifiers(scxml, errors);
    validateInitialAttributeTargetsChild(scxml, errors);
    validateDatamodelConsistency(scxml, errors);

    return deduplicateErrors(errors);
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/validators/scxml-validator.ts
git commit -m "feat: wire event-identifier, initial-child, and datamodel validators into SCXMLValidator"
```

---

## Self-Review Checklist

| Spec requirement | Task that covers it |
|-----------------|---------------------|
| Problem 1: `event=""` → error | Task 1 (`validateSingleEvent` empty check) |
| Problem 2: C# keyword as event | Task 1 (`CSHARP_KEYWORDS` check) |
| Problem 3: Event starts with digit | Task 1 (regex `^\d` check) |
| Problem 4: `initial` → non-child | Task 2 (`validateInitialAttributeTargetsChild`) |
| Problem 5: `assign` not in `datamodel` | Task 3 (`validateDatamodelConsistency` undeclared check) |
| Problem 6: Wildcard `*` in assign | Task 3 (`location.includes('*')` check) |
| Problem 7: Readable string collision | Task 1 (`validateReadableStringCollisions`) |
| All validators active in editor | Task 4 (wired into `SCXMLValidator.validate()`) |
