# Extensible Custom Tag Architecture & Registration Guide

This document outlines the architecture for allowing end-users to register custom XML tags in the `scxml-parser` library. By implementing a plugin-based tag registry, the parser core remains **closed for modification** (no changes needed to core engine files when adding new tags) while remaining **open to extension** (end-users can define custom AST nodes, parsing logic, validation rules, and serialization handlers).

---

## 1. Architectural Overview & Design Principles

```
                                 ┌─────────────────────────────┐
                                 │      CustomTagRegistry      │
                                 └──────────────┬──────────────┘
                                                │
                               Registers CustomTagSpec<T>
                                                │
           ┌────────────────────────────────────┼────────────────────────────────────┐
           ▼                                    ▼                                    ▼
┌────────────────────┐                ┌────────────────────┐                ┌────────────────────┐
│    Parser Hook     │                │   Validator Hook   │                │  Serializer Hook   │
│  (XML ➔ CustomAST) │                │  (validateAST)     │                │ (CustomAST ➔ XML)  │
└────────────────────┘                └────────────────────┘                └────────────────────┘
```

### Core Design Guarantees

1. **Zero Core Modifications:** Adding support for non-standard or domain-specific tags (e.g., `<gate>`, `<rule>`, `<policy>`, `<log>`) does not require editing core AST types, parser loops, or validation logic.
2. **Type Safety:** Custom tags supply their own AST interfaces extending `CustomASTNode`, preserving full TypeScript autocompletion and type checking for end-consumers.
3. **Pipeline Isolation:** A malformed custom tag triggers isolated diagnostic warnings in `validateAST` without crashing the core parser or invalidating surrounding standard SCXML nodes.
4. **Metadata-Scoped Placement:** Custom tags are **only honored inside a `<metadata>` block** (the W3C-sanctioned escape hatch). This keeps the emitted SCXML structurally valid for standards-tight consumers and SCXML UI editors, and avoids tag collisions with domain content. Bare registered tags are reported via `WARN_CUSTOM_TAG_OUTSIDE_METADATA` and preserved as opaque metadata.

---

## 2. Core Extension Specifications & Data Contracts

### A. Custom AST Node Base Contract (`src/types/extensibility.ts`)

All custom tags are stored as structured nodes within the `customChildren` array on standard SCXML AST nodes (`SCXMLDocument`, `StateNode`, `TransitionNode`).

```typescript
import type { SCXMLNode, ValidationDiagnostic } from './index';

/**
 * Representational contract for custom parsed AST nodes.
 */
export interface CustomASTNode {
  type: 'custom';
  tagName: string;
  attributes: Record<string, string>;
  children?: (CustomASTNode | SCXMLNode)[];
  textContent?: string;
  payload?: Record<string, any>;
}

/**
 * Context passed to custom tag parser handlers.
 */
export interface CustomTagParseContext {
  tagName: string;
  attributes: Record<string, string>;
  children: any[];
  textContent?: string;
  parentASTNode: SCXMLNode;
}

/**
 * Complete extension contract required to define a custom SCXML tag.
 */
export interface CustomTagSpec<TNode CustomASTNode="CustomASTNode" extends> {
  /** The exact XML tag name (case-insensitive registration) */
  tagName: string;

  /** Allowed parent AST contexts (e.g., ['state', 'transition', 'scxml']) */
  allowedParents?: string[];

  /** Transforms raw XML attributes and children into a typed AST Node */
  parse: (ctx: CustomTagParseContext) => TNode;

  /** Validates custom AST properties and returns diagnostic errors */
  validate?: (node: TNode, parentNode: SCXMLNode) => ValidationDiagnostic[];

  /** Serializes the custom AST node back into a formatted XML string */
  serialize?: (node: TNode, indentLevel: number) => string;
}
```

---

### B. Global & Instance Registry API (`src/registry/TagRegistry.ts`)

The `TagRegistry` maintains registered specifications and exposes lookup utilities for the parser, validator, and serializer pipelines.

```typescript
import type { CustomTagSpec } from '../types/extensibility';

export class TagRegistry {
  private static instance: TagRegistry;
  private registry: Map<string, CustomTagSpec> = new Map();

  /** Access singleton instance */
  public static getInstance(): TagRegistry {
    if (!TagRegistry.instance) {
      TagRegistry.instance = new TagRegistry();
    }
    return TagRegistry.instance;
  }

  /** Register a custom tag spec */
  public register<T CustomTagSpec extends>(spec: T): this {
    this.registry.set(spec.tagName.toLowerCase(), spec);
    return this;
  }

  /** Lookup tag spec by name */
  public get(tagName: string): CustomTagSpec | undefined {
    return this.registry.get(tagName.toLowerCase());
  }

  /** Check if a tag name is registered */
  public has(tagName: string): boolean {
    return this.registry.has(tagName.toLowerCase());
  }

  /** Unregister all custom tags (useful for isolated unit testing) */
  public clear(): void {
    this.registry.clear();
  }
}
```

---

## 3. Engine Pipeline Integration

### A. Parser Integration (`src/parser/index.ts`)

When the XML parser encounters an unhandled tag, it checks `TagRegistry`. If present, it delegates creation to the registered `parse` function and attaches the output to `parentASTNode.customChildren`.

```typescript
import { TagRegistry } from "../registry/TagRegistry";
import type { SCXMLNode } from "../types";

export function handleUnknownOrCustomTag(
  tagName: string,
  rawXmlNode: any,
  parentASTNode: SCXMLNode,
): boolean {
  const registry = TagRegistry.getInstance();

  if (!registry.has(tagName)) {
    return false; // Tag is unrecognized; defer to default fallback/warning
  }

  const spec = registry.get(tagName)!;
  const customNode = spec.parse({
    tagName,
    attributes: rawXmlNode[":@"] || {},
    children: rawXmlNode.children || [],
    textContent: rawXmlNode.text,
    parentASTNode,
  });

  parentASTNode.customChildren = parentASTNode.customChildren || [];
  parentASTNode.customChildren.push(customNode);
  return true;
}
```

---

### B. Validator Integration (`src/validator/index.ts`)

During AST traversal, `validateAST` inspects `customChildren` and evaluates both structural parent rules and custom validation hooks.

```typescript
import { TagRegistry } from "../registry/TagRegistry";
import type { SCXMLNode, ValidationDiagnostic } from "../types";

export function validateCustomChildren(
  parentNode: SCXMLNode,
  parentTagName: string,
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const registry = TagRegistry.getInstance();

  if (!parentNode.customChildren) return diagnostics;

  for (const customNode of parentNode.customChildren) {
    const spec = registry.get(customNode.tagName);
    if (!spec) continue;

    // 1. Parent Scope Check
    if (
      spec.allowedParents &&
      !spec.allowedParents.includes(parentTagName.toLowerCase())
    ) {
      diagnostics.push({
        severity: "error",
        code: "ERR_CUSTOM_TAG_INVALID_PARENT",
        message: `<${customNode.tagName}> is not allowed inside <${parentTagName}>. Allowed parents: ${spec.allowedParents.join(", ")}`,
      });
    }

    // 2. Custom Rule Execution
    if (spec.validate) {
      diagnostics.push(...spec.validate(customNode, parentNode));
    }
  }

  return diagnostics;
}
```

---

### C. Serializer Integration (`src/serializer/index.ts`)

`serializeSCXML` delegates custom node string generation back to the registered `serialize` hook, or falls back to standard key-value XML string formatting.

```typescript
import { TagRegistry } from "../registry/TagRegistry";
import type { CustomASTNode } from "../types";

export function serializeCustomASTNodes(
  nodes: CustomASTNode[],
  indentLevel: number,
): string {
  const registry = TagRegistry.getInstance();
  const indent = "  ".repeat(indentLevel);
  const lines: string[] = [];

  for (const node of nodes) {
    const spec = registry.get(node.tagName);
    if (spec && spec.serialize) {
      lines.push(spec.serialize(node, indentLevel));
    } else {
      // Default fallback XML formatting
      const attrs = Object.entries(node.attributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      lines.push(`${indent}<${node.tagName}${attrs ? " " + attrs : ""} />`);
    }
  }

  return lines.join("\n");
}
```

---

## 4. End-User Implementation Example

The example below demonstrates how an external consumer registers a custom `<gate>` tag to define logic gate expressions inside transition elements.

> **Placement rule:** custom tags are **only honored inside a `<metadata>` block**. A registered tag appearing as a bare direct child emits `WARN_CUSTOM_TAG_OUTSIDE_METADATA`; an unregistered tag inside `<metadata>` emits `WARN_UNREGISTERED_METADATA_TAG` and is preserved as opaque metadata. This keeps the emitted SCXML structurally valid per the standard.

```typescript
import {
  SCXMLEngine,
  TagRegistry,
  type CustomASTNode,
} from "@your-org/scxml-parser";

// 1. Define Strongly-Typed Custom Node
interface GateASTNode extends CustomASTNode {
  tagName: "gate";
  payload: {
    gateType: "AND" | "OR" | "NOT";
    ruleId: string;
  };
}

// 2. Register Spec via TagRegistry or SCXMLEngine
SCXMLEngine.registerTag<GateASTNode>({
  tagName: "gate",
  allowedParents: ["transition", "state"],

  parse: (ctx) => ({
    type: "custom",
    tagName: "gate",
    attributes: ctx.attributes,
    payload: {
      gateType: (ctx.attributes.type as "AND" | "OR" | "NOT") || "AND",
      ruleId: ctx.attributes.ruleId || "",
    },
  }),

  validate: (node) => {
    const errors = [];
    if (!node.payload.ruleId) {
      errors.push({
        severity: "error" as const,
        code: "ERR_GATE_RULE_ID_REQUIRED",
        message: '<gate> element requires a non-empty "ruleId" attribute.',
      });
    }
    return errors;
  },

  serialize: (node, indentLevel) => {
    const indent = "  ".repeat(indentLevel);
    return `${indent}<gate type="${node.payload.gateType}" ruleId="${node.payload.ruleId}" />`;
  },
});

// 3. Execute Engine Operations
const rawXML = `
<scxml version="1.0" initial="Idle">
  <state id="Idle">
    <transition event="SUBMIT" target="Processing">
      <metadata>
        <gate type="AND" ruleId="rule_verify_credit" />
      </metadata>
    </transition>
  </state>
  <state id="Processing" />
</scxml>
`;

// Parse
const ast = SCXMLEngine.parse(rawXML);

// Validate
const diagnostics = SCXMLEngine.validate(ast);
console.log("Validation Diagnostics:", diagnostics); // Output: []

// Serialize
const outputXML = SCXMLEngine.serialize(ast, { pretty: true });
console.log(outputXML);
```

---

## 5. Testing Strategy for Extensible Tags

To maintain 100% path coverage, unit tests verify registry handling, validation enforcement, and serialization fidelity.

| Test Case                     | Scope      | Expected Outcome                                                               |
| :---------------------------- | :--------- | :----------------------------------------------------------------------------- |
| `TagRegistry.register()`      | Registry   | Successfully registers and retrieves `CustomTagSpec` by case-insensitive name. |
| `parseSCXML` with Custom Tag  | Parser     | Populates `customChildren` array on parent AST node with structured payload.   |
| `validateAST` Scope Violation | Validator  | Emits `ERR_CUSTOM_TAG_INVALID_PARENT` if tag appears outside `allowedParents`. |
| `validateAST` Custom Logic    | Validator  | Emits user-defined diagnostics when custom validation constraints fail.        |
| `serializeSCXML` Formatting   | Serializer | Output XML string matches custom `serialize()` layout or default tag fallback. |
