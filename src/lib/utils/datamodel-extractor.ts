import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { ConditionEvaluator } from "@/lib/scxml/condition-evaluator";

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function parseDataNodes(xmlContent: string): Array<Record<string, string>> {
  let result: unknown;
  try {
    result = xmlParser.parse(xmlContent);
  } catch {
    return [];
  }
  const dataNodes: Array<Record<string, string>> = [];

  function collect(node: unknown) {
    if (!node || typeof node !== "object") return;
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (key === "data") {
        const items = Array.isArray(val) ? val : [val];
        for (const item of items) {
          if (item && typeof item === "object") dataNodes.push(item as Record<string, string>);
        }
      } else {
        collect(val);
      }
    }
  }

  collect(result);
  return dataNodes;
}

/**
 * Extracts all <data id="..."> variable names from an SCXML document.
 */
export function extractDatamodelVariables(xmlContent: string): string[] {
  return parseDataNodes(xmlContent)
    .map((node) => node["@_id"])
    .filter(Boolean);
}

export interface ConfigField {
  name: string;
  type: 'string' | 'double' | 'bool' | 'int';
  defaultValue: string;
}

function inferType(value: string): ConfigField['type'] {
  if (!value.trim() || value.includes("'")) return 'string';
  if (value.includes('.')) return 'double';
  if (value === 'true' || value === 'false') return 'bool';
  return 'int';
}

export function extractConfigFields(xmlContent: string): ConfigField[] {
  const res =  parseDataNodes(xmlContent)
    .filter((node) => node["@_id"]?.startsWith("conf_"))
    .map((node) => {
      const name = node["@_id"].slice(5);
      const defaultValue = node["@_expr"] ?? "";
      return { name, type: inferType(defaultValue), defaultValue };
    });
    return res;
}

const updateParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: false,
  preserveOrder: true,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
});

const updateBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
  suppressEmptyNode: true,
});

export function updateConfigFieldExpr(xmlContent: string, name: string, newValue: string): string {
  let doc: unknown[];
  try {
    doc = updateParser.parse(xmlContent) as unknown[];
  } catch {
    return xmlContent;
  }

  const targetId = `conf_${name}`;

  function walk(nodes: unknown[]): void {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const nodeObj = node as Record<string, unknown>;
      if ("data" in nodeObj) {
        const attrs = nodeObj[":@"] as Record<string, string> | undefined;
        if (attrs?.["@_id"] === targetId) attrs["@_expr"] = newValue;
      } else {
        for (const [key, val] of Object.entries(nodeObj)) {
          if (key !== ":@" && Array.isArray(val)) walk(val);
        }
      }
    }
  }

  walk(doc);
  return updateBuilder.build(doc);
}

const SCXML_EXPR_ATTRS = new Set(['@_cond', '@_expr', '@_location', '@_namelist', '@_targetexpr', '@_srcexpr']);

/**
 * Returns variable names referenced in SCXML expressions/conditions that are not
 * declared in the datamodel, not reserved (this_* or conf_* prefixes), and not
 * already present as a physical channel in IO.conf.
 * These are "unresolved channel references" that need to be mapped to physical channels.
 */
export function extractUnresolvedChannelRefs(xmlContent: string, channels: string[]): string[] {
  const channelSet = new Set(channels);
  const refs = new Set<string>();

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlContent);
  } catch {
    return [];
  }

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (SCXML_EXPR_ATTRS.has(key) && typeof val === 'string') {
        for (const v of ConditionEvaluator.extractVariables(val)) {
          refs.add(v);
        }
      } else if (key !== ':@') {
        if (Array.isArray(val)) val.forEach(walk);
        else walk(val);
      }
    }
  }

  walk(parsed);

  return Array.from(refs)
    .filter(r => !r.startsWith('this_') && !r.startsWith('conf_') && !channelSet.has(r))
    .sort();
}