import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { CORE_SCHEMA, binaryTag, load, mergeTag, omapTag, pairsTag, setTag } from "js-yaml";
import type { OpenAPI3 } from "../types.js";
import { debug, error, escapePointer, parseRef } from "./utils.js";

/**
 * Load an OpenAPI document and bundle every external $ref into a single document.
 *
 * External $refs that point to a reusable object (Schema, Response, Parameter, …)
 * are hoisted into `components` and replaced with a local $ref; all other external
 * $refs are inlined. Naming and ordering follow Redocly’s bundler (which earlier
 * versions used) so generated types don’t change.
 */

export interface LoadOptions {
  cwd: URL;
  silent: boolean;
}

interface Doc {
  /** absolute file path or URL */
  id: string;
  parsed: any;
  anchors?: Map<string, unknown>;
}

interface Resolved {
  node: any;
  doc: Doc;
  /** escaped JSON Pointer within doc, e.g. `#/components/schemas/Foo` */
  pointer: string;
}

interface Location {
  doc: Doc;
  pointer: string;
}

// Same YAML schema Redocly used: JSON schema + merge keys, no timestamps.
// js-yaml 5's CORE_SCHEMA matches js-yaml 4's (lenient) JSON_SCHEMA.
const YAML_SCHEMA = CORE_SCHEMA.withTags(mergeTag, binaryTag, omapTag, pairsTag, setTag);

function parseYaml(source: string, filename: string): unknown {
  return load(source, { schema: YAML_SCHEMA, filename });
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRef(value: unknown): value is { $ref: string } {
  return isPlainObject(value) && typeof value.$ref === "string";
}

function isAbsoluteUrl(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}

function isAnchor(ref: string): boolean {
  return /^#[A-Za-z][A-Za-z0-9\-_:.]*$/.test(ref);
}

function isMappingRef(mapping: string): boolean {
  return (
    mapping.startsWith("#") ||
    mapping.startsWith("https://") ||
    mapping.startsWith("http://") ||
    mapping.startsWith("./") ||
    mapping.startsWith("../") ||
    mapping.indexOf("/") > -1
  );
}

function joinPointer(base: string, key: string | number): string {
  const b = base === "" ? "#/" : base;
  return b.endsWith("/") ? `${b}${key}` : `${b}/${key}`;
}

function resolveUri(base: string, uri: string): string {
  if (isAbsoluteUrl(uri)) {
    return uri;
  }
  if (isAbsoluteUrl(base)) {
    return new URL(uri, base).href;
  }
  return path.resolve(base.endsWith(path.sep) ? base : path.dirname(base), uri);
}

/** filename without extension */
function refBaseName(ref: string): string {
  const parts = ref.split(/[/\\]/);
  return parts[parts.length - 1].replace(/\.[^.]+$/, "");
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  return aKeys.every((k) => k in b && deepEqual((a as any)[k], (b as any)[k]));
}

async function readStream(stream: Readable): Promise<string> {
  let content = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    content += chunk;
  }
  return content.trim();
}

/** Parse the root document from any supported input */
async function loadRoot(source: unknown, cwd: URL, loader: DocLoader): Promise<Doc> {
  if (!source) {
    throw new Error("Can’t parse empty schema");
  }
  const cwdPath = fileURLToPath(cwd);
  const id = cwdPath.endsWith(path.sep) ? cwdPath : `${cwdPath}${path.sep}`;
  if (source instanceof URL) {
    const result = await loader.load(source.protocol === "file:" ? fileURLToPath(source) : source.href, true);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }
  if (source instanceof Readable) {
    return loadRoot(await readStream(source), cwd, loader);
  }
  if (source instanceof Buffer) {
    return loadRoot(source.toString("utf8"), cwd, loader);
  }
  if (typeof source === "string") {
    if (source.startsWith("http://") || source.startsWith("https://") || source.startsWith("file://")) {
      return loadRoot(new URL(source), cwd, loader);
    }
    return { id, parsed: source[0] === "{" ? JSON.parse(source) : parseYaml(source, id) };
  }
  if (isPlainObject(source)) {
    return { id, parsed: structuredClone(source) };
  }
  throw new Error(`Expected string, object, or Buffer. Got ${Array.isArray(source) ? "Array" : typeof source}`);
}

/** Loads and caches external documents */
class DocLoader {
  docs = new Map<string, Doc | Error>();

  async load(id: string, isRoot = false): Promise<Doc | Error> {
    const cached = this.docs.get(id);
    if (cached) {
      return cached;
    }
    let result: Doc | Error;
    try {
      let body: string;
      let mimeType: string | undefined;
      if (isAbsoluteUrl(id)) {
        const res = await fetch(id);
        if (!res.ok) {
          throw new Error(`Failed to load ${id}: ${res.status} ${res.statusText}`);
        }
        body = await res.text();
        mimeType = res.headers.get("content-type") ?? undefined;
      } else {
        body = (await fs.promises.readFile(id, "utf8")).replace(/\r\n/g, "\n");
      }
      const ext = id.slice(id.lastIndexOf("."));
      const isData = [".json", ".yml", ".yaml"].includes(ext) || /(json|yaml|openapi)/.test(mimeType ?? "");
      result = { id, parsed: isData || isRoot ? parseYaml(body, id) : body };
    } catch (err) {
      result = err instanceof Error ? err : new Error(String(err));
    }
    this.docs.set(id, result);
    return result;
  }

  /** Load every document reachable through $refs */
  async loadRefs(doc: Doc): Promise<void> {
    const uris = new Set<string>();
    const scan = (node: unknown, inMapping = false): void => {
      if (!node || typeof node !== "object") {
        return;
      }
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "string" && (k === "$ref" || (inMapping && isMappingRef(v)))) {
          const { uri } = parseRef(v);
          if (uri && !isAnchor(v)) {
            uris.add(resolveUri(doc.id, uri));
          }
        } else {
          scan(v, k === "mapping");
        }
      }
    };
    scan(doc.parsed);
    await Promise.all(
      [...uris].map(async (id) => {
        if (this.docs.has(id)) {
          return;
        }
        const loaded = await this.load(id);
        if (!(loaded instanceof Error)) {
          await this.loadRefs(loaded);
        }
      }),
    );
  }
}

// OpenAPI type tree (property order matters: it decides the order components are hoisted in)

/** scalar: only walked to inline a $ref */
const S = 0;
type PropType = string | typeof S | null | undefined;
interface TypeDef {
  /** known properties, in walk order */
  p?: Record<string, PropType | ((value: any, key: string) => PropType)>;
  /** type for all other properties */
  a?: PropType | ((value: any, key: string) => PropType);
  /** type of array items */
  i?: string;
  /** walk x- extensions */
  x?: true;
}

const schemaOrBool = (v: unknown) => (typeof v === "boolean" ? S : "Schema");
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

const OAS3_0: Record<string, TypeDef> = {
  Root: {
    p: {
      openapi: null,
      info: "Info",
      servers: "ServerList",
      security: "SecurityRequirementList",
      tags: "TagList",
      externalDocs: "ExternalDocs",
      paths: "Paths",
      components: "Components",
      "x-webhooks": "WebhooksMap",
      "x-tagGroups": "TagGroups",
      "x-ignoredHeaderParameters": S,
    },
    x: true,
  },
  Tag: { p: { name: S, description: S, externalDocs: "ExternalDocs", "x-traitTag": S, "x-displayName": S }, x: true },
  TagList: { i: "Tag" },
  TagGroup: { p: { name: S, tags: S }, x: true },
  TagGroups: { i: "TagGroup" },
  ExternalDocs: { p: { description: S, url: S }, x: true },
  Server: { p: { url: S, description: S, variables: "ServerVariablesMap" }, x: true },
  ServerList: { i: "Server" },
  ServerVariable: { p: { enum: S, default: S, description: S }, x: true },
  ServerVariablesMap: { a: "ServerVariable" },
  SecurityRequirement: { a: S },
  SecurityRequirementList: { i: "SecurityRequirement" },
  Info: {
    p: {
      title: S,
      version: S,
      description: S,
      termsOfService: S,
      contact: "Contact",
      license: "License",
      "x-logo": "Logo",
    },
    x: true,
  },
  Logo: { p: { url: S, altText: S, backgroundColor: S, href: S } },
  Contact: { p: { name: S, url: S, email: S }, x: true },
  License: { p: { name: S, url: S }, x: true },
  Paths: { a: (_, key) => (key.startsWith("/") ? "PathItem" : undefined) },
  WebhooksMap: { a: "PathItem" },
  PathItem: {
    p: {
      $ref: S,
      servers: "ServerList",
      parameters: "ParameterList",
      summary: S,
      description: S,
      ...Object.fromEntries(METHODS.map((m) => [m, "Operation"])),
    },
    x: true,
  },
  Parameter: {
    p: {
      name: S,
      in: S,
      description: S,
      required: S,
      deprecated: S,
      allowEmptyValue: S,
      style: S,
      explode: S,
      allowReserved: S,
      schema: "Schema",
      example: S,
      examples: "ExamplesMap",
      content: "MediaTypesMap",
    },
    x: true,
  },
  ParameterList: { i: "Parameter" },
  Operation: {
    p: {
      tags: S,
      summary: S,
      description: S,
      externalDocs: "ExternalDocs",
      operationId: S,
      parameters: "ParameterList",
      security: "SecurityRequirementList",
      servers: "ServerList",
      requestBody: "RequestBody",
      responses: "Responses",
      deprecated: S,
      callbacks: "CallbacksMap",
      "x-codeSamples": "XCodeSampleList",
      "x-code-samples": "XCodeSampleList",
      "x-hideTryItPanel": S,
    },
    x: true,
  },
  XCodeSample: { p: { lang: S, label: S, source: S } },
  XCodeSampleList: { i: "XCodeSample" },
  Callback: { a: "PathItem" },
  CallbacksMap: { a: "Callback" },
  RequestBody: { p: { description: S, required: S, content: "MediaTypesMap" }, x: true },
  MediaTypesMap: { a: "MediaType" },
  MediaType: { p: { schema: "Schema", example: S, examples: "ExamplesMap", encoding: "EncodingMap" }, x: true },
  Example: { p: { value: S, summary: S, description: S, externalValue: S }, x: true },
  ExamplesMap: { a: "Example" },
  Encoding: {
    p: { contentType: S, headers: "HeadersMap", style: S, explode: S, allowReserved: S },
    x: true,
  },
  EncodingMap: { a: "Encoding" },
  Header: {
    p: {
      description: S,
      required: S,
      deprecated: S,
      allowEmptyValue: S,
      style: S,
      explode: S,
      allowReserved: S,
      schema: "Schema",
      example: S,
      examples: "ExamplesMap",
      content: "MediaTypesMap",
    },
    x: true,
  },
  HeadersMap: { a: "Header" },
  Responses: {
    p: { default: "Response" },
    a: (_, key) => (/^[0-9][0-9Xx]{2}$/.test(key) ? "Response" : undefined),
  },
  Response: {
    p: { description: S, headers: "HeadersMap", content: "MediaTypesMap", links: "LinksMap", "x-summary": S },
    x: true,
  },
  Link: {
    p: { operationRef: S, operationId: S, parameters: null, requestBody: null, description: S, server: "Server" },
    x: true,
  },
  LinksMap: { a: "Link" },
  Schema: {
    p: {
      externalDocs: "ExternalDocs",
      discriminator: "Discriminator",
      title: S,
      multipleOf: S,
      maximum: S,
      minimum: S,
      exclusiveMaximum: S,
      exclusiveMinimum: S,
      maxLength: S,
      minLength: S,
      pattern: S,
      maxItems: S,
      minItems: S,
      uniqueItems: S,
      maxProperties: S,
      minProperties: S,
      required: S,
      enum: S,
      type: S,
      allOf: "SchemaList",
      anyOf: "SchemaList",
      oneOf: "SchemaList",
      not: "Schema",
      properties: "SchemaProperties",
      items: (v) => (Array.isArray(v) ? "SchemaList" : "Schema"),
      additionalProperties: schemaOrBool,
      description: S,
      format: S,
      default: null,
      nullable: S,
      readOnly: S,
      writeOnly: S,
      xml: "Xml",
      example: S,
      deprecated: S,
      "x-tags": S,
      "x-additionalPropertiesName": S,
      "x-explicitMappingOnly": S,
    },
    x: true,
  },
  SchemaList: { i: "Schema" },
  SchemaMap: { a: "Schema" },
  SchemaProperties: { a: "Schema" },
  Xml: { p: { name: S, namespace: S, prefix: S, attribute: S, wrapped: S }, x: true },
  Discriminator: { p: { propertyName: S, mapping: "DiscriminatorMapping" }, x: true },
  DiscriminatorMapping: {}, // handled in walk()
  Components: {
    p: {
      parameters: "NamedParameters",
      schemas: "NamedSchemas",
      responses: "NamedResponses",
      examples: "NamedExamples",
      requestBodies: "NamedRequestBodies",
      headers: "NamedHeaders",
      securitySchemes: "NamedSecuritySchemes",
      links: "NamedLinks",
      callbacks: "NamedCallbacks",
    },
    x: true,
  },
  NamedSchemas: { a: "Schema" },
  NamedResponses: { a: "Response" },
  NamedParameters: { a: "Parameter" },
  NamedExamples: { a: "Example" },
  NamedRequestBodies: { a: "RequestBody" },
  NamedHeaders: { a: "Header" },
  NamedSecuritySchemes: { a: "SecurityScheme" },
  NamedLinks: { a: "Link" },
  NamedCallbacks: { a: "Callback" },
  SecurityScheme: {
    p: {
      type: S,
      description: S,
      name: S,
      in: S,
      scheme: S,
      bearerFormat: S,
      flows: S,
      openIdConnectUrl: S,
      "x-defaultClientId": S,
    },
    x: true,
  },
  SpecExtension: { a: S },
};

const OAS3_1: Record<string, TypeDef> = {
  ...OAS3_0,
  Root: {
    p: {
      openapi: null,
      info: "Info",
      servers: "ServerList",
      security: "SecurityRequirementList",
      tags: "TagList",
      externalDocs: "ExternalDocs",
      paths: "Paths",
      webhooks: "WebhooksMap",
      components: "Components",
      jsonSchemaDialect: S,
    },
    x: true,
  },
  Info: {
    p: {
      title: S,
      version: S,
      description: S,
      termsOfService: S,
      summary: S,
      contact: "Contact",
      license: "License",
      "x-logo": "Logo",
    },
    x: true,
  },
  License: { p: { name: S, url: S, identifier: S }, x: true },
  Components: {
    p: { ...OAS3_0.Components.p, pathItems: "NamedPathItems" },
    x: true,
  },
  NamedPathItems: { a: "PathItem" },
  Schema: {
    p: {
      $id: S,
      $anchor: S,
      id: S,
      $schema: S,
      definitions: "NamedSchemas",
      $defs: "NamedSchemas",
      $vocabulary: S,
      externalDocs: "ExternalDocs",
      discriminator: "Discriminator",
      title: S,
      multipleOf: S,
      maximum: S,
      minimum: S,
      exclusiveMaximum: S,
      exclusiveMinimum: S,
      maxLength: S,
      minLength: S,
      pattern: S,
      maxItems: S,
      minItems: S,
      uniqueItems: S,
      maxProperties: S,
      minProperties: S,
      required: S,
      enum: S,
      type: S,
      allOf: "SchemaList",
      anyOf: "SchemaList",
      oneOf: "SchemaList",
      not: "Schema",
      if: "Schema",
      // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
      then: "Schema",
      else: "Schema",
      dependentSchemas: "SchemaMap",
      dependentRequired: "DependentRequired",
      prefixItems: "SchemaList",
      contains: "Schema",
      minContains: S,
      maxContains: S,
      patternProperties: "SchemaProperties",
      propertyNames: "Schema",
      unevaluatedItems: schemaOrBool,
      unevaluatedProperties: schemaOrBool,
      summary: S,
      properties: "SchemaProperties",
      items: schemaOrBool,
      additionalProperties: schemaOrBool,
      description: S,
      format: S,
      contentEncoding: S,
      contentMediaType: S,
      contentSchema: "Schema",
      default: null,
      readOnly: S,
      writeOnly: S,
      xml: "Xml",
      examples: S,
      example: S,
      deprecated: S,
      const: null,
      $comment: S,
      "x-tags": S,
      $dynamicAnchor: S,
      $dynamicRef: S,
    },
    x: true,
  },
  SchemaProperties: { a: schemaOrBool },
  DependentRequired: { a: S },
  SecurityScheme: {
    p: {
      type: S,
      description: S,
      name: S,
      in: S,
      scheme: S,
      bearerFormat: S,
      flows: S,
      openIdConnectUrl: S,
    },
    x: true,
  },
};

const COMPONENT_TYPES: Record<string, string> = {
  Schema: "schemas",
  Parameter: "parameters",
  Response: "responses",
  Example: "examples",
  RequestBody: "requestBodies",
  Header: "headers",
  Link: "links",
  Callback: "callbacks",
};

/** Validate the OpenAPI version */
function checkVersion(parsed: any) {
  const openapiVersion = Number.parseFloat(parsed?.openapi);
  if (
    parsed?.swagger ||
    !parsed?.openapi ||
    Number.isNaN(openapiVersion) ||
    openapiVersion < 3 ||
    openapiVersion >= 4
  ) {
    if (parsed?.swagger) {
      throw new Error("Unsupported Swagger version: 2.x. Use OpenAPI 3.x instead.");
    }
    if (parsed?.openapi || openapiVersion < 3 || openapiVersion >= 4) {
      throw new Error(`Unsupported OpenAPI version: ${parsed.openapi}`);
    }
    throw new Error("Unsupported schema format, expected `openapi: 3.x`");
  }
}

/**
 * Load, validate, and bundle an OpenAPI document
 */
export async function loadSchema(source: unknown, options: LoadOptions): Promise<OpenAPI3> {
  const loadT = performance.now();
  const loader = new DocLoader();
  const root = await loadRoot(source, options.cwd, loader);
  checkVersion(root.parsed);
  await loader.loadRefs(root);
  debug("Loaded schema", "bundle", performance.now() - loadT);

  const bundleT = performance.now();
  const types = String(root.parsed.openapi).startsWith("3.0") ? OAS3_0 : OAS3_1;
  const components: Record<string, Record<string, unknown>> = root.parsed.components ?? {};
  root.parsed.components = components;
  const errors: string[] = [];
  const seen = new Map<string, Set<unknown>>();
  const operationIds = new Set<string>();
  /** $refs rewritten by the bundler, keyed by `${doc.id}::${$ref}` */
  const bundledRefs = new Map<string, Resolved>();

  function getDoc(id: string): Doc | Error {
    return loader.docs.get(id) ?? new Error(`Could not load ${id}`);
  }

  function getAnchors(doc: Doc): Map<string, unknown> {
    if (!doc.anchors) {
      const anchors = new Map<string, unknown>();
      const scan = (node: unknown) => {
        if (!node || typeof node !== "object") {
          return;
        }
        if (!Array.isArray(node) && typeof (node as any).$anchor === "string") {
          anchors.set(`#${(node as any).$anchor}`, node);
        }
        for (const v of Object.values(node)) {
          scan(v);
        }
      };
      scan(doc.parsed);
      doc.anchors = anchors;
    }
    return doc.anchors;
  }

  function resolve($ref: string, from: Doc, stack: unknown[] = []): Resolved | Error {
    const bundled = bundledRefs.get(`${from.id}::${$ref}`);
    if (bundled) {
      return bundled;
    }
    if (isAnchor($ref)) {
      return { node: getAnchors(from).get($ref), doc: from, pointer: $ref };
    }
    const { uri, pointer } = parseRef($ref);
    const targetDoc = uri ? getDoc(resolveUri(from.id, uri)) : from;
    if (targetDoc instanceof Error) {
      return targetDoc;
    }
    let result: Resolved = { node: targetDoc.parsed, doc: targetDoc, pointer: "#/" };
    for (const segment of pointer) {
      const target = result.node;
      if (target === null || typeof target !== "object") {
        result.node = undefined;
        break;
      }
      if (target[segment] !== undefined) {
        result.node = target[segment];
        result.pointer = joinPointer(result.pointer, escapePointer(segment));
      } else if (isRef(target)) {
        if (stack.includes(target)) {
          return new Error("Self-referencing circular pointer");
        }
        const next = resolve(target.$ref, result.doc, [...stack, target]);
        if (next instanceof Error) {
          return next;
        }
        result = {
          node: next.node?.[segment],
          doc: next.doc,
          pointer: joinPointer(next.pointer, escapePointer(segment)),
        };
      } else {
        result.node = undefined;
        break;
      }
    }
    if (isRef(result.node)) {
      if (stack.includes(result.node)) {
        return new Error("Self-referencing circular pointer");
      }
      return resolve(result.node.$ref, result.doc, [...stack, result.node]);
    }
    return result;
  }

  function report(message: string, pointer: string) {
    errors.push(`${message} at ${pointer}`);
  }

  function getComponentName(target: Resolved, componentType: string): string {
    const group = components[componentType];
    const isSame = (name: string) => !group[name] || deepEqual(group[name], target.node);
    let name = "";
    const refParts = target.pointer.slice(2).split("/").filter(Boolean);
    while (refParts.length > 0) {
      name = refParts.pop() + (name ? `-${name}` : "");
      if (isSame(name)) {
        return name;
      }
    }
    name = refBaseName(target.doc.id) + (name ? `_${name}` : "");
    if (isSame(name)) {
      return name;
    }
    const prevName = name;
    let serialId = 2;
    while (!isSame(name)) {
      name = `${prevName}-${serialId}`;
      serialId++;
    }
    return name;
  }

  function saveComponent(componentType: string, target: Resolved): string {
    components[componentType] ??= {};
    const name = getComponentName(target, componentType);
    components[componentType][name] = target.node;
    return `#/components/${componentType}/${name}`;
  }

  function onRefLeave(
    node: { $ref: string },
    type: string | typeof S,
    loc: Location,
    parent: any,
    key: string | number,
    resolved: Resolved | Error,
  ) {
    if (resolved instanceof Error || resolved.node === undefined) {
      report(`Can't resolve $ref${resolved instanceof Error ? `: ${resolved.message}` : ""}`, loc.pointer);
      return;
    }
    if (resolved.doc === root && loc.doc === root && type !== S) {
      return; // local $ref: keep as-is
    }
    const componentType = typeof type === "string" ? COMPONENT_TYPES[type] : undefined;
    if (!componentType) {
      // inline
      if (!isPlainObject(resolved.node)) {
        parent[key] = resolved.node;
      } else {
        const ref: Record<string, unknown> = node;
        delete ref.$ref;
        Object.assign(ref, { ...resolved.node, ...ref }); // sibling fields take precedence
      }
      return;
    }
    node.$ref = saveComponent(componentType, resolved);
    bundledRefs.set(`${loc.doc.id}::${node.$ref}`, { node: resolved.node, doc: root, pointer: node.$ref });
  }

  function walk(node: any, type: string | typeof S, loc: Location, parent: any, key: string | number): void {
    let resolvedNode = node;
    let resolvedLoc = loc;
    let resolved: Resolved | Error | undefined;
    if (isRef(node)) {
      resolved = resolve(node.$ref, loc.doc);
      resolvedNode = resolved instanceof Error ? undefined : resolved.node;
      resolvedLoc = resolved instanceof Error ? loc : { doc: resolved.doc, pointer: resolved.pointer };
    }

    if (resolvedNode !== undefined && type !== S) {
      const seenNodes = seen.get(type) ?? new Set();
      seen.set(type, seenNodes);
      if (!seenNodes.has(resolvedNode)) {
        seenNodes.add(resolvedNode);
        walkChildren(node, resolvedNode, types[type] ?? types.SpecExtension, type, loc, resolvedLoc);
      }
    }

    if (resolved) {
      onRefLeave(node, type, loc, parent, key, resolved);
    }
  }

  function walkChildren(
    node: any,
    resolvedNode: any,
    def: TypeDef,
    type: string,
    loc: Location,
    resolvedLoc: Location,
  ) {
    const child = (l: Location, k: string | number): Location => ({
      doc: l.doc,
      pointer: joinPointer(l.pointer, escapePointer(k)),
    });

    if (Array.isArray(resolvedNode)) {
      if (def.i) {
        for (let i = 0; i < resolvedNode.length; i++) {
          walk(resolvedNode[i], def.i, child(resolvedLoc, i), resolvedNode, i);
        }
      }
      return;
    }
    if (!isPlainObject(resolvedNode)) {
      return;
    }

    if (type === "DiscriminatorMapping") {
      const mappingRefs = Object.entries(resolvedNode).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && isMappingRef(entry[1]),
      );
      for (const [k, v] of mappingRefs) {
        walk({ $ref: v }, "Schema", child(resolvedLoc, k), {}, k);
      }
      for (const [k, v] of mappingRefs) {
        const target = resolve(v, resolvedLoc.doc);
        if (!(target instanceof Error) && target.node !== undefined) {
          resolvedNode[k] = saveComponent("schemas", target);
        }
      }
      return;
    }

    if (type === "Operation" && typeof resolvedNode.operationId === "string") {
      if (operationIds.has(resolvedNode.operationId)) {
        report(
          "Every operation must have a unique `operationId`.",
          joinPointer(resolvedLoc.pointer, escapePointer(resolvedNode.operationId)),
        );
      }
      operationIds.add(resolvedNode.operationId);
    }

    const keys = Object.keys(def.p ?? {});
    for (const k of Object.keys(resolvedNode)) {
      if (!keys.includes(k) && (def.a !== undefined || (def.x && k.startsWith("x-")))) {
        keys.push(k);
      }
    }
    if (isRef(node)) {
      keys.push(...Object.keys(node).filter((k) => k !== "$ref" && !keys.includes(k))); // properties next to $ref
    }

    for (const k of keys) {
      let value = resolvedNode[k];
      let l = resolvedLoc;
      if (value === undefined) {
        value = node[k];
        l = loc; // properties next to $ref resolve against the original location
      }
      let propType = def.p?.[k];
      if (propType === undefined) {
        propType = def.a;
      }
      if (typeof propType === "function") {
        propType = propType(value, k);
      }
      if (propType === undefined && def.x && k.startsWith("x-")) {
        propType = "SpecExtension";
      }
      if (propType === null || propType === undefined || (propType === S && !isRef(value))) {
        continue;
      }
      walk(value, propType, child(l, k), resolvedNode, k);
    }
  }

  walk(root.parsed, "Root", { doc: root, pointer: "#/" }, undefined, "");

  if (errors.length) {
    for (const message of errors) {
      error(message);
    }
    throw new Error(errors[errors.length - 1]);
  }
  debug("Bundled schema", "bundle", performance.now() - bundleT);

  return root.parsed;
}
