/**
 * SCXML AST structural & semantic validation.
 *
 * Inspects an in-memory SCXML AST directly (rather than raw XML text) and
 * returns a list of diagnostics. This module mirrors and generalizes the
 * W3C / authoring constraints with a stable diagnostic-code contract.
 */
import { TagRegistry } from '../registry/TagRegistry';
import { parserTracer } from '../tracing';
import type { InitialBlock, SCXMLDocument, StateNode, Transition } from '../types/ast';
import type { ValidationDiagnostic } from '../types/diagnostics';
import type { CustomASTNode, CustomParentNode } from '../types/extensibility';
import {
  buildStateHierarchy,
  collectAllStateIds,
  collectStateIds,
  parseIdList,
  walkStateNodes,
} from './walker';

/**
 * Validates an in-memory SCXML AST against structural and semantic rules.
 *
 * @param doc - The parsed SCXML AST.
 * @returns A list of validation diagnostics (empty when valid).
 */
export function validateAST(doc: SCXMLDocument): ValidationDiagnostic[] {
  return parserTracer.withSpan('parser.validateAST', {}, () => {
    const diagnostics: ValidationDiagnostic[] = [];
    const stateIds = new Set<string>();
    const parentMap = new Map<string, string | null>();

    collectStateIds(doc, stateIds);
    buildStateHierarchy(doc, parentMap);

    validateDuplicateStateIds(doc, diagnostics);
    validateTransitionTargets(doc, stateIds, diagnostics);
    validateInitialReferences(doc, stateIds, diagnostics);
    validateTransitionTypes(doc, diagnostics);
    validateEventNames(doc, diagnostics);
    validateDuplicateDataIds(doc, diagnostics);
    validateCustomChildren(doc, diagnostics);
    validateCompoundStateInitial(doc, diagnostics);

    return diagnostics;
  });
}

/**
 * Flags state ids that are duplicated anywhere in the document (SCXML
 * requires globally unique ids within a document scope).
 */
function validateDuplicateStateIds(doc: SCXMLDocument, diagnostics: ValidationDiagnostic[]): void {
  const seen = new Set<string>();
  for (const id of collectAllStateIds(doc)) {
    if (seen.has(id)) {
      diagnostics.push({
        message: `Duplicate state id '${id}'. State ids must be unique within the document`,
        code: 'ERR_DUPLICATE_STATE_ID',
        severity: 'error',
        nodeId: id,
      });
    }
    seen.add(id);
  }
}

/**
 * Validates that every transition target and initial reference points to an
 * existing state id.
 */
function validateTransitionTargets(
  doc: SCXMLDocument,
  stateIds: Set<string>,
  diagnostics: ValidationDiagnostic[],
): void {
  const checkTargets = (transitions: Transition[], ownerId?: string): void => {
    for (const t of transitions) {
      if (!t.target) {
        continue;
      }
      for (const target of parseIdList(t.target)) {
        if (!stateIds.has(target)) {
          diagnostics.push({
            message: `Transition target '${target}' not found. Make sure a state with id="${target}" exists in your SCXML document`,
            code: 'ERR_INVALID_TRANSITION_TARGET',
            severity: 'error',
            nodeId: ownerId,
            transitionId: t.id,
          });
        }
      }
    }
  };

  walkStateNodes(doc, (node) => {
    if ('transitions' in node) {
      checkTargets(node.transitions, node.id);
    }
  });
}

/**
 * Validates that initial attributes and <initial> transition targets resolve.
 */
function validateInitialReferences(
  doc: SCXMLDocument,
  stateIds: Set<string>,
  diagnostics: ValidationDiagnostic[],
): void {
  const root = doc.scxml;
  const checkInitial = (value: string | undefined, ownerId?: string): void => {
    if (!value) {
      return;
    }
    for (const id of parseIdList(value)) {
      if (!stateIds.has(id)) {
        diagnostics.push({
          message: `Initial state '${id}'${ownerId ? ` in state '${ownerId}'` : ''} not found. Make sure a state with id="${id}" exists in your SCXML document`,
          code: 'ERR_INITIAL_STATE_NOT_FOUND',
          severity: 'error',
          nodeId: ownerId,
        });
      }
    }
  };

  checkInitial(root.initial);

  walkStateNodes(doc, (node) => {
    if ('initial' in node && node.initial) {
      checkInitial(node.initial, node.id);
    }
    // Validate <initial> block default-transition targets when present.
    const initialBlock = (node as unknown as { initialBlock?: InitialBlock }).initialBlock;
    if (initialBlock) {
      checkInitialBlockTargets(initialBlock, stateIds, diagnostics);
    }
  });
}

/**
 * Recursively validates the targets of <initial> block transitions.
 */
function checkInitialBlockTargets(
  block: InitialBlock,
  stateIds: Set<string>,
  diagnostics: ValidationDiagnostic[],
): void {
  if (block.transition && block.transition.length > 0) {
    for (const t of block.transition) {
      if (!t.target) {
        continue;
      }
      for (const id of parseIdList(t.target)) {
        if (!stateIds.has(id)) {
          diagnostics.push({
            message: `Initial transition target '${id}' not found. Make sure a state with id="${id}" exists in your SCXML document`,
            code: 'ERR_INITIAL_STATE_NOT_FOUND',
            severity: 'error',
            transitionId: t.id,
          });
        }
      }
    }
  }
  if (block.blocks) {
    for (const nested of block.blocks) {
      checkInitialBlockTargets(nested, stateIds, diagnostics);
    }
  }
}

/**
 * Validates transition `type` values ('internal' or 'external').
 */
function validateTransitionTypes(doc: SCXMLDocument, diagnostics: ValidationDiagnostic[]): void {
  walkStateNodes(doc, (node) => {
    if (!('transitions' in node)) {
      return;
    }
    for (const t of node.transitions) {
      if (t.type && t.type !== 'internal' && t.type !== 'external') {
        diagnostics.push({
          message: `Invalid transition type '${t.type}'. Must be 'internal' or 'external'`,
          code: 'ERR_INVALID_TRANSITION_TYPE',
          severity: 'error',
          transitionId: t.id,
        });
      }
    }
  });
}

/**
 * Validates event names on transitions.
 */
function validateEventNames(doc: SCXMLDocument, diagnostics: ValidationDiagnostic[]): void {
  const eventNamePattern = /^[a-zA-Z_][a-zA-Z0-9_\-.]*(\.\*)?$/;
  walkStateNodes(doc, (node) => {
    if (!('transitions' in node)) {
      return;
    }
    for (const t of node.transitions) {
      if (!t.event) {
        continue;
      }
      const events = t.event
        .split(/[\s,]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      for (const event of events) {
        if (event !== '*' && !eventNamePattern.test(event)) {
          diagnostics.push({
            message: `Invalid event name '${event}'. Event names must be valid identifiers`,
            code: 'ERR_INVALID_EVENT_NAME',
            severity: 'warning',
            transitionId: t.id,
          });
        }
      }
    }
  });
}

/**
 * Validates that datamodel variable ids are unique across the document.
 */
function validateDuplicateDataIds(doc: SCXMLDocument, diagnostics: ValidationDiagnostic[]): void {
  const seen = new Set<string>();
  const seenAt = new Map<string, string>();
  let scopeName = '';

  const checkData = (data: Array<{ id: string }> | undefined): void => {
    if (!data) {
      return;
    }
    for (const d of data) {
      if (seen.has(d.id)) {
        diagnostics.push({
          message: `Duplicate datamodel variable '${d.id}' (also defined in ${seenAt.get(d.id)})`,
          code: 'ERR_DUPLICATE_DATA_ID',
          severity: 'error',
        });
      } else {
        seen.add(d.id);
        seenAt.set(d.id, scopeName || 'root scope');
      }
    }
  };

  checkData(doc.scxml.datamodelChildren);
  scopeName = 'a state scope';
  walkStateNodes(doc, (node) => {
    if ('datamodel' in node && node.datamodel) {
      checkData(node.datamodel);
    }
  });
}

/**
 * Validates registered custom-tag children attached to the root, states, and
 * transitions. For each custom node it enforces the spec's `allowedParents`
 * scope and runs the spec's custom `validate` hook.
 */
function validateCustomChildren(doc: SCXMLDocument, diagnostics: ValidationDiagnostic[]): void {
  const root = doc.scxml;
  if (root.customChildren) {
    for (const custom of root.customChildren) {
      applyCustomScope(custom, root, 'scxml', diagnostics);
    }
  }

  walkStateNodes(doc, (stateLike) => {
    if ('customChildren' in stateLike && stateLike.customChildren) {
      for (const custom of stateLike.customChildren) {
        applyCustomScope(custom, stateLike, 'state', diagnostics);
      }
    }
    const transitions = 'transitions' in stateLike ? stateLike.transitions : [];
    for (const t of transitions) {
      if (t.customChildren) {
        for (const custom of t.customChildren) {
          applyCustomScope(custom, t, 'transition', diagnostics);
        }
      }
    }
  });
}

/**
 * Applies parent-scope and custom-hook validation to a single custom node.
 */
function applyCustomScope(
  custom: CustomASTNode,
  parent: CustomParentNode,
  parentTagName: string,
  diagnostics: ValidationDiagnostic[],
): void {
  const spec = TagRegistry.getInstance().get(custom.tagName);
  if (!spec) {
    return;
  }
  if (spec.allowedParents && !spec.allowedParents.includes(parentTagName)) {
    diagnostics.push({
      severity: 'error',
      code: 'ERR_CUSTOM_TAG_INVALID_PARENT',
      message: `<${custom.tagName}> is not allowed inside <${parentTagName}>. Allowed parents: ${spec.allowedParents.join(', ')}`,
    });
  }
  if (spec.validate) {
    diagnostics.push(...spec.validate(custom, parent));
  }
}

/**
 * Flags sequential compound `<state>` elements that have child states but
 * declare no default initial child (neither an `initial` attribute nor an
 * `<initial>` block).
 *
 * Per W3C SCXML §3.3.2 the default initial is the first child in document
 * order; the runtime engine now honors that fallback. This warning surfaces
 * the implicit default so authors aren't surprised when a compound state
 * silently descends into its first child.
 */
function validateCompoundStateInitial(
  doc: SCXMLDocument,
  diagnostics: ValidationDiagnostic[],
): void {
  walkStateNodes(doc, (node) => {
    // Only sequential <state> nodes (not <parallel> / <final>) carry the
    // `initial` attribute; guard on that to keep parallel semantics out.
    if (!('initial' in node)) {
      return;
    }
    const state = node as StateNode;

    const hasChildren =
      state.states.length > 0 || state.parallels.length > 0 || state.finals.length > 0;

    const hasExplicitInitial = Boolean(state.initial) || Boolean(state.initialBlock);

    if (hasChildren && !hasExplicitInitial) {
      diagnostics.push({
        message: `Compound state '${state.id}' has child state(s) but no explicit 'initial'. It will default to the first child in document order`,
        code: 'WARN_COMPOUND_STATE_NO_INITIAL',
        severity: 'warning',
        nodeId: state.id,
      });
    }
  });
}
