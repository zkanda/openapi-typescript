import type { ParameterObject, ReferenceObject } from "../types.js";
import { parseRef } from "./utils.js";

/**
 * Minimal TypeScript type AST. Only what openapi-typescript emits is modeled,
 * and the printer reproduces the formatting of the TypeScript compiler’s printer
 * (4-space indent, multi-line type literals and tuples) so output stays stable.
 */
export type Keyword = "boolean" | "never" | "null" | "number" | "string" | "undefined" | "unknown";

export type TypeNode =
  | { kind: "keyword"; name: Keyword }
  /** literal printed verbatim (e.g. `"foo"`, `1`, `-1`, `true`) */
  | { kind: "literal"; text: string }
  /** type reference, e.g. `components` or `Record<string, never>` */
  | { kind: "ref"; name: string; args?: TypeNode[] }
  /** indexed access, e.g. `T["index"]` */
  | { kind: "indexed"; object: TypeNode; index: string }
  | { kind: "array"; element: TypeNode }
  | { kind: "tuple"; elements: TypeNode[] }
  | { kind: "union"; types: TypeNode[] }
  | { kind: "intersection"; types: TypeNode[] }
  | { kind: "object"; members: Member[] }
  /** TypeScript type source printed verbatim (from the `transform` option) */
  | { kind: "verbatim"; text: string };

/** Property signature (or index signature, if `indexSignature` is set) */
export interface Member {
  /** printed property key (identifier, number, or quoted string; see tsPropertyIndex()) */
  name: string;
  type: TypeNode;
  optional?: boolean;
  readonly?: boolean;
  /** if set, print as `[indexSignature: string]: type` */
  indexSignature?: string;
  /** comment body, without the surrounding `/*` and `*\/` */
  comment?: string;
}

export type Declaration =
  | { kind: "interface"; name: string; members: Member[] }
  | { kind: "alias"; name: string; type: TypeNode }
  /** pre-formatted TypeScript */
  | { kind: "raw"; name: string; text: string };

export type Node = TypeNode | Declaration;

export const JS_PROPERTY_INDEX_RE = /^[A-Za-z_$][A-Za-z_$0-9]*$/;

const keyword = (name: Keyword): TypeNode => ({ kind: "keyword", name });
export const BOOLEAN = keyword("boolean");
export const NEVER = keyword("never");
export const NULL = keyword("null");
export const NUMBER = keyword("number");
export const STRING = keyword("string");
export const UNDEFINED = keyword("undefined");
export const UNKNOWN = keyword("unknown");
export const TRUE: TypeNode = { kind: "literal", text: "true" };
export const FALSE: TypeNode = { kind: "literal", text: "false" };

const LB_RE = /\r?\n/g;
const COMMENT_RE = /\*\//g;

export interface AnnotatedSchemaObject {
  const?: unknown; // jsdoc without value
  default?: unknown; // jsdoc with value
  deprecated?: boolean; // jsdoc without value
  description?: string; // jsdoc with value
  enum?: unknown[]; // jsdoc without value
  example?: string; // jsdoc with value
  examples?: unknown;
  format?: string; // not jsdoc
  nullable?: boolean; // Node information
  summary?: string; // not jsdoc
  title?: string; // not jsdoc
  type?: string | string[]; // Type of node
}

/**
 * Preparing comments from fields
 * @see {comment} for output examples
 * @returns void if not comments or jsdoc format comment string
 */
export function addJSDocComment(schemaObject: AnnotatedSchemaObject, member: Member): void {
  if (!schemaObject || typeof schemaObject !== "object" || Array.isArray(schemaObject)) {
    return;
  }
  const output: string[] = [];

  // Not JSDoc tags: [title, format]
  if (schemaObject.title) {
    output.push(schemaObject.title.trim().replace(LB_RE, "\n *     "));
  }
  if (schemaObject.summary) {
    output.push(schemaObject.summary.trim().replace(LB_RE, "\n *     "));
  }
  if (schemaObject.format) {
    output.push(`Format: ${schemaObject.format}`);
  }

  // JSDoc tags without value
  // 'Deprecated' without value
  if (schemaObject.deprecated) {
    output.push("@deprecated");
  }

  // JSDoc tags with value
  const supportedJsDocTags = ["description", "default", "example"] as const;
  for (const field of supportedJsDocTags) {
    const allowEmptyString = field === "default" || field === "example";
    if (schemaObject[field] === undefined) {
      continue;
    }
    if (schemaObject[field] === "" && !allowEmptyString) {
      continue;
    }
    const value = schemaObject[field];
    // parsed JSON/YAML: anything that isn’t an object is a primitive
    const serialized =
      typeof value === "object" ? JSON.stringify(value, null, 2) : String(value as string | number | boolean);
    output.push(`@${field} ${serialized.trim().replace(LB_RE, "\n *     ")}`);
  }

  if (Array.isArray(schemaObject.examples)) {
    for (const example of schemaObject.examples) {
      const serialized = typeof example === "object" ? JSON.stringify(example, null, 2) : example;
      output.push(`@example ${String(serialized).trim().replace(LB_RE, "\n *     ")}`);
    }
  }

  // JSDoc 'Constant' without value
  if ("const" in schemaObject) {
    output.push("@constant");
  }

  // JSDoc 'Enum' with type
  if (schemaObject.enum) {
    let type = "unknown";
    if (Array.isArray(schemaObject.type)) {
      type = schemaObject.type.join("|");
    } else if (typeof schemaObject.type === "string") {
      type = schemaObject.type;
    }
    output.push(`@enum {${type}${schemaObject.nullable ? "|null" : ""}}`);
  }

  // attach comment if it has content
  if (output.length) {
    // Check if any output item contains multi-line content (has internal line breaks)
    const hasMultiLineContent = output.some((item) => item.includes("\n"));

    const text =
      output.length === 1 && !hasMultiLineContent ? `* ${output.join("\n")} ` : `*\n * ${output.join("\n * ")}\n `;
    member.comment = text.replace(COMMENT_RE, "*\\/"); // prevent inner comments from leaking
  }
}

function isParameterObject(obj: ParameterObject | ReferenceObject | undefined): obj is ParameterObject {
  return Boolean(obj && !("$ref" in obj) && obj.in);
}

function addIndexedAccess(node: TypeNode, ...segments: readonly string[]): TypeNode {
  return segments.reduce<TypeNode>((acc, segment) => ({ kind: "indexed", object: acc, index: segment }), node);
}

/**
 * Convert OpenAPI ref into TS indexed access node (ex: `components["schemas"]["Foo"]`)
 * `path` is a JSON Pointer to a location within an OpenAPI document.
 * Transform it into a TypeScript type reference into the generated types.
 *
 * In most cases the structures of the openapi-typescript generated types and the
 * JSON Pointer paths into the OpenAPI document are the same. However, in some cases
 * special transformations are necessary to account for the ways they differ.
 *   * Object schemas
 *       $refs into the `properties` of object schemas are valid, but openapi-typescript
 *       flattens these objects, so we omit  so the index into the schema skips ["properties"]
 *   * Parameters
 *       $refs into the `parameters` of paths are valid, but openapi-ts represents
 *       them according to their type; path, query, header, etc… so in these cases we
 *       must check the parameter definition to determine the how to index into
 *       the openapi-typescript type.
 **/
export function oapiRef(path: string, resolved?: ParameterObject | ReferenceObject): TypeNode {
  const { pointer } = parseRef(path);
  if (pointer.length === 0) {
    throw new Error(`Error parsing $ref: ${path}. Is this a valid $ref?`);
  }

  const parametersObject = isParameterObject(resolved);

  // Initial segments are handled in a fixed , then remaining segments are treated
  // according to heuristics based on the initial segments
  const initialSegment = pointer[0];
  const leadingSegments = pointer.slice(1, 3);
  const restSegments = pointer.slice(3);

  const leadingType = addIndexedAccess({ kind: "ref", name: String(initialSegment) }, ...leadingSegments);

  return restSegments.reduce<TypeNode>((acc, segment, index, original) => {
    // Skip `properties` items when in the middle of the pointer
    // See: https://github.com/openapi-ts/openapi-typescript/issues/1742
    if (segment === "properties") {
      return acc;
    }

    if (parametersObject && index === original.length - 1) {
      return addIndexedAccess(acc, resolved.in, resolved.name);
    }

    return addIndexedAccess(acc, segment);
  }, leadingType);
}

/**
 * Deduplicate simple primitive types from an array of nodes
 * Note: won’t deduplicate complex types like objects
 */
export function tsDedupe(types: TypeNode[]): TypeNode[] {
  const encounteredTypes = new Set<Keyword>();
  const filteredTypes: TypeNode[] = [];
  for (const t of types) {
    if (t.kind === "keyword" && tsIsPrimitive(t)) {
      if (encounteredTypes.has(t.name)) {
        continue;
      }
      encounteredTypes.add(t.name);
    }
    filteredTypes.push(t);
  }
  return filteredTypes;
}

/** Create an intersection type */
export function tsIntersection(types: TypeNode[]): TypeNode {
  if (types.length === 0) {
    return NEVER;
  }
  if (types.length === 1) {
    return types[0];
  }
  return { kind: "intersection", types: tsDedupe(types) };
}

/** Is this a primitive type (string, number, boolean, null, undefined)? */
export function tsIsPrimitive(type: TypeNode | undefined): boolean {
  if (!type) {
    return true;
  }
  return type.kind === "keyword" && type.name !== "unknown";
}

/** Create a literal type */
export function tsLiteral(value: unknown): TypeNode {
  if (typeof value === "string") {
    return { kind: "literal", text: JSON.stringify(value) };
  }
  if (typeof value === "number") {
    return { kind: "literal", text: value < 0 ? `-${Math.abs(value)}` : String(value) };
  }
  if (typeof value === "boolean") {
    return value === true ? TRUE : FALSE;
  }
  if (value === null) {
    return NULL;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { kind: "array", element: NEVER };
    }
    return { kind: "tuple", elements: value.map((v: unknown) => tsLiteral(v)) };
  }
  if (typeof value === "object") {
    const members: Member[] = [];
    for (const [k, v] of Object.entries(value)) {
      members.push({ name: tsPropertyIndex(k), type: tsLiteral(v) });
    }
    return members.length ? { kind: "object", members } : tsRecord(STRING, NEVER);
  }
  return UNKNOWN;
}

/** Create a T | null union */
export function tsNullable(types: TypeNode[]): TypeNode {
  return { kind: "union", types: [...types, NULL] };
}

/** Create a TS Omit<X, Y> type */
export function tsOmit(type: TypeNode, keys: string[]): TypeNode {
  return { kind: "ref", name: "Omit", args: [type, { kind: "union", types: keys.map((k) => tsLiteral(k)) }] };
}

/** Create a TS Record<X, Y> type */
export function tsRecord(key: TypeNode, value: TypeNode): TypeNode {
  return { kind: "ref", name: "Record", args: [key, value] };
}

/** Create a valid property index */
export function tsPropertyIndex(index: string | number): string {
  if (
    (typeof index === "number" && !(index < 0)) ||
    (typeof index === "string" && String(Number(index)) === index && index[0] !== "-")
  ) {
    return String(index);
  }
  return typeof index === "string" && JS_PROPERTY_INDEX_RE.test(index) ? index : tsStringLiteral(String(index));
}

/** Create a union type */
export function tsUnion(types: TypeNode[]): TypeNode {
  if (types.length === 0) {
    return NEVER;
  }
  if (types.length === 1) {
    return types[0];
  }
  return { kind: "union", types: tsDedupe(types) };
}

const WITH_REQUIRED_HELPER = `type WithRequired<T, K extends keyof T> = T & {
    [P in K]-?: T[P];
};`;

/** Create a WithRequired<X, Y> type */
export function tsWithRequired(
  type: TypeNode,
  keys: string[],
  injectFooter: Node[], // needed to inject type helper if used
): TypeNode {
  if (keys.length === 0) {
    return type;
  }

  // inject helper, if needed
  if (!injectFooter.some((node) => node.kind === "raw" && node.name === "WithRequired")) {
    injectFooter.push({ kind: "raw", name: "WithRequired", text: WITH_REQUIRED_HELPER });
  }

  return { kind: "ref", name: "WithRequired", args: [type, tsUnion(keys.map((k) => tsLiteral(k)))] };
}

// Printer

const INDENT = "    ";

/** Convert AST nodes to TypeScript source */
export function astToString(ast: Node | Member | (Node | Member)[]): string {
  const nodes = Array.isArray(ast) ? ast : [ast];
  return nodes.map((node) => `${printNode(node)}\n`).join("");
}

function printNode(node: Node | Member): string {
  if (!("kind" in node)) {
    return printMember(node, 0);
  }
  switch (node.kind) {
    case "interface":
      return `export interface ${node.name} ${printType({ kind: "object", members: node.members }, 0)}`;
    case "alias":
      return `export type ${node.name} = ${printType(node.type, 0)};`;
    case "raw":
      return node.text;
    default:
      return printType(node, 0);
  }
}

function printType(type: TypeNode, level: number): string {
  switch (type.kind) {
    case "keyword":
      return type.name;
    case "literal":
    case "verbatim":
      return type.text;
    case "ref":
      return type.args ? `${type.name}<${type.args.map((t) => printType(t, level)).join(", ")}>` : type.name;
    case "indexed":
      return `${printType(type.object, level)}[${tsStringLiteral(type.index)}]`;
    case "array": {
      const element = printType(type.element, level);
      return needsParens(type.element) ? `(${element})[]` : `${element}[]`;
    }
    case "tuple": {
      const pad = INDENT.repeat(level);
      const elements = type.elements.map((t) => `${pad}${INDENT}${printType(t, level + 1)}`);
      return elements.length ? `[\n${elements.join(",\n")}\n${pad}]` : `[\n${pad}]`;
    }
    case "union":
    case "intersection":
      return type.types
        .map((t) => {
          const printed = printType(t, level);
          return needsParens(t) ? `(${printed})` : printed;
        })
        .join(type.kind === "union" ? " | " : " & ");
    case "object":
      if (!type.members.length) {
        return "{}";
      }
      return `{\n${type.members.map((m) => printMember(m, level + 1)).join("\n")}\n${INDENT.repeat(level)}}`;
  }
}

/** Whether a type must be parenthesized inside an array, union, or intersection */
function needsParens(type: TypeNode): boolean {
  return (
    type.kind === "union" ||
    type.kind === "intersection" ||
    (type.kind === "verbatim" && /[|&?]|=>|\b(?:keyof|readonly|unique)\b/.test(type.text))
  );
}

function printMember(member: Member, level: number): string {
  const pad = INDENT.repeat(level);
  const comment = member.comment ? `${printComment(member.comment, level)}\n` : "";
  const name = member.indexSignature ? `[${member.indexSignature}: string]` : member.name;
  return `${comment}${pad}${member.readonly ? "readonly " : ""}${name}${member.optional ? "?" : ""}: ${printType(member.type, level)};`;
}

const WHITESPACE_RE = /[^\S\r\n\u2028\u2029]/;

/** Print a multi-line comment, re-indenting continuation lines the way the TypeScript printer does */
function printComment(text: string, level: number): string {
  const lines = `/*${text}*/`.split(/\r\n|[\n\r\u2028\u2029]/);
  return lines
    .map((line) => {
      let indent = level * INDENT.length;
      for (const ch of line) {
        if (ch === "\t") {
          indent += INDENT.length - (indent % INDENT.length);
        } else if (WHITESPACE_RE.test(ch)) {
          indent++;
        } else {
          break;
        }
      }
      return `${" ".repeat(indent)}${line.trim()}`;
    })
    .join("\n");
}

// String escaping (matches the TypeScript printer’s escapeNonAsciiString())

const ESCAPED_CHARS: Record<string, string> = {
  "\t": "\\t",
  "\v": "\\v",
  "\f": "\\f",
  "\b": "\\b",
  "\r": "\\r",
  "\n": "\\n",
  "\\": "\\\\",
  '"': '\\"',
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
  "\u0085": "\\u0085",
};
// oxlint-disable-next-line no-control-regex -- control characters must be escaped
const ESCAPE_RE = /[\\"\u0000-\u001f\u2028\u2029\u0085]/g;
// oxlint-disable-next-line no-control-regex -- matches everything outside ASCII
const NON_ASCII_RE = /[^\u0000-\u007F]/g;

function utf16Escape(charCode: number): string {
  return `\\u${charCode.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Create a double-quoted string literal */
export function tsStringLiteral(value: string): string {
  const escaped = value
    .replace(ESCAPE_RE, (c, offset: number, str: string) => {
      if (c === "\0") {
        const next = str.charCodeAt(offset + 1);
        return next >= 0x30 && next <= 0x39 ? "\\x00" : "\\0";
      }
      return ESCAPED_CHARS[c] ?? utf16Escape(c.charCodeAt(0));
    })
    .replace(NON_ASCII_RE, (c) => utf16Escape(c.charCodeAt(0)));
  return `"${escaped}"`;
}
