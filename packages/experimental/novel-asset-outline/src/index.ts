/** Structured YAML `planning.outline` Host Asset contribution. */

import { createHash } from 'node:crypto'
import { parseDocument, type Document } from 'yaml'
import type { Context } from '@deepseek-ai/cordis'
import {
  AssetId,
  NovelRepositoryError,
  type AssetSnapshot,
  type ContentHash,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type {
  NovelAssetMaterialization,
  NovelAssetTypeDefinition,
  ParsedNovelAsset,
} from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'
import type {
  OutlineNode,
  OutlineNodeChanges,
  OutlineNodeSelectionInput,
  OutlineNodeSelector,
  PlanningOutlineContent,
  UpdateOutlineNodeOperation,
} from './types.ts'

export type {
  OutlineNode,
  OutlineNodeChanges,
  OutlineNodeSelectionInput,
  OutlineNodeSelector,
  PlanningOutlineContent,
  UpdateOutlineNodeOperation,
} from './types.ts'

export const name = 'novel-asset-outline'
export const inject = ['novelAssetTypes']

const MAX_NODES = 5_000
const MAX_DEPTH = 64
const MAX_ID_UNITS = 128
const MAX_TITLE_UNITS = 240
const MAX_FIELD_UNITS = 16_384
const NODE_FIELDS = new Set(['id', 'title', 'summary', 'goal', 'conflict', 'turn', 'children'])
const CHANGE_FIELDS = new Set(['title', 'summary', 'goal', 'conflict', 'turn'])

/** Register the structured outline definition for the caller plugin lifetime. */
export function apply(ctx: Context): void {
  ctx.novelAssetTypes.register(planningOutlineTypeDefinition)
}

/** Complete Host behavior for exact `planning.outline` YAML assets. */
export const planningOutlineTypeDefinition: NovelAssetTypeDefinition = {
  type: 'planning.outline',
  contentRoot: 'planning',
  extensions: ['.yaml', '.yml'],
  model: {
    description: 'A structured ordered outline tree whose nodes have stable asset-local ids.',
    proposalInstructions: 'Use exactly one operation: {"kind":"update-outline-node","nodeId":"<stable id>","changes":{"title"?:"...","summary"?:"..."|null,"goal"?:"..."|null,"conflict"?:"..."|null,"turn"?:"..."|null}}. At least one field is required. This cannot create, delete, reorder, or rename a node id.',
  },
  parse: parseOutline,
  serializeContent(snapshot, value, title) {
    const content = outlineContent(value, snapshot.asset.projectRelativePath)
    const document = outlineDocument(snapshot.serializedUtf8, snapshot.asset.projectRelativePath)
    if (title !== undefined) document.setIn(['novel', 'title'], outlineTitle(title, snapshot.asset.projectRelativePath))
    document.set('nodes', content.nodes.map(serializeNode))
    return materialization(document.toString(), snapshot)
  },
  captureSelection(snapshot, input, options) {
    const selection = outlineSelectionInput(input)
    const node = findNode(outlineContent(snapshot.content, snapshot.asset.projectRelativePath).nodes, selection.nodeId)
    if (node === undefined) invalidSelection(`node ${JSON.stringify(selection.nodeId)} does not exist`)
    return {
      selector: { kind: 'outline-node', nodeId: node.id, nodeHash: hashNode(node) },
      preview: Array.from(node.title).slice(0, options.previewUnits).join(''),
    }
  },
  modelText(snapshot, selector) {
    const content = outlineContent(snapshot.content, snapshot.asset.projectRelativePath)
    const title = parsedNovel(snapshot.frontmatter, snapshot.asset.projectRelativePath)['title']
    if (selector === undefined) return JSON.stringify({ kind: 'planning.outline', title, nodes: content.nodes }, null, 2)
    const frozen = outlineSelector(selector)
    const node = findNode(content.nodes, frozen.nodeId)
    if (node === undefined || hashNode(node) !== frozen.nodeHash) invalidSelection('the retained outline node no longer matches its selector')
    return JSON.stringify({ kind: 'outline-node', outlineTitle: title, node }, null, 2)
  },
  prepareOperations(snapshot, input) {
    if (!Array.isArray(input) || input.length !== 1) invalidChangeSet('operations must contain exactly one item')
    const raw: unknown = input[0]
    if (!isRecord(raw) || raw['kind'] !== 'update-outline-node' || typeof raw['nodeId'] !== 'string') {
      invalidChangeSet('model operation is not a valid update-outline-node input')
    }
    const changes = outlineChanges(raw['changes'], 'model operation')
    const captured = this.captureSelection(snapshot, {
      kind: 'outline-node', nodeId: raw['nodeId'],
    }, { contextUnits: 0, previewUnits: 1 })
    return [{ kind: 'update-outline-node', selector: outlineSelector(captured.selector), changes }]
  },
  decodeOperations(value) {
    if (!Array.isArray(value) || value.length !== 1) invalidChangeSet('operations must contain exactly one item')
    const raw: unknown = value[0]
    if (!isRecord(raw) || raw['kind'] !== 'update-outline-node') {
      invalidChangeSet('operation is not an update-outline-node operation')
    }
    return [{
      kind: 'update-outline-node',
      selector: outlineSelector(raw['selector']),
      changes: outlineChanges(raw['changes'], 'durable operation'),
    }]
  },
  materializeOperations(snapshot, operations) {
    const decoded = outlineOperations(operations)
    const [operation] = decoded
    if (operation === undefined || decoded.length !== 1) invalidChangeSet('operations must contain exactly one item')
    const content = outlineContent(snapshot.content, snapshot.asset.projectRelativePath)
    const current = findNode(content.nodes, operation.selector.nodeId)
    if (current === undefined) invalidChangeSet('target outline node does not exist in the retained Revision')
    if (hashNode(current) !== operation.selector.nodeHash) invalidChangeSet('target outline node hash does not match the retained Revision')
    const nodes = updateNode(content.nodes, operation.selector.nodeId, node => applyNodeChanges(node, operation.changes))
    return this.serializeContent(snapshot, { kind: 'outline', nodes })
  },
}

/**
 * Strictly parse one complete YAML outline Asset.
 * @param bytes - complete UTF-8 YAML file bytes.
 * @param path - Project-relative path used in validation diagnostics.
 * @returns the validated Asset metadata and typed outline content.
 */
export function parseOutline(bytes: Uint8Array, path: string): ParsedNovelAsset {
  const document = outlineDocument(bytes, path)
  let raw: unknown
  try {
    raw = document.toJS({ maxAliasCount: 0 }) as unknown
  } catch (error: unknown) {
    invalidAsset(path, 'YAML aliases are not supported', error)
  }
  if (!isRecord(raw)) invalidAsset(path, 'the YAML root must be a mapping')
  if (containsControlDeep(raw)) invalidAsset(path, 'the YAML document must not contain control characters')
  const novel = parsedNovel(raw, path)
  if (novel['schema'] !== 1) {
    if (typeof novel['schema'] === 'number' && Number.isSafeInteger(novel['schema'])) {
      throw new NovelRepositoryError(
        `novel repository: asset ${JSON.stringify(path)} uses unsupported schema ${novel['schema']}`,
        'NOVEL_PROJECT_SCHEMA_UNSUPPORTED',
      )
    }
    invalidAsset(path, 'novel.schema must be the integer 1')
  }
  if (novel['type'] !== 'planning.outline') invalidAsset(path, 'novel.type must be "planning.outline"')
  const id = authoredString(novel['id'], 'novel.id', path, MAX_ID_UNITS)
  const title = outlineTitle(novel['title'], path)
  const ids = new Set<string>()
  let count = 0
  const nodes = parseNodes(raw['nodes'], path, ids, 1, () => {
    count += 1
    if (count > MAX_NODES) invalidAsset(path, `outline contains more than ${MAX_NODES} nodes`)
  })
  return {
    id: AssetId(id),
    type: 'planning.outline',
    title,
    frontmatter: raw,
    content: { kind: 'outline', nodes },
    source: null,
  }
}

function outlineDocument(bytes: Uint8Array | string, path: string): Document {
  let text: string
  if (typeof bytes === 'string') text = bytes
  else {
    if (bytes.includes(0)) invalidAsset(path, 'the file contains a NUL byte')
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch (error: unknown) {
      invalidAsset(path, 'the file is not valid UTF-8', error)
    }
  }
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true })
  const [firstError] = document.errors
  if (firstError !== undefined) invalidAsset(path, firstError.message, firstError)
  const [firstWarning] = document.warnings
  if (firstWarning !== undefined) invalidAsset(path, firstWarning.message, firstWarning)
  return document
}

function parseNodes(
  value: unknown,
  path: string,
  ids: Set<string>,
  depth: number,
  count: () => void,
): readonly OutlineNode[] {
  if (!Array.isArray(value)) invalidAsset(path, 'nodes and children must be sequences')
  if (depth > MAX_DEPTH) invalidAsset(path, `outline nesting exceeds ${MAX_DEPTH} levels`)
  return value.map((raw, index) => {
    count()
    if (!isRecord(raw)) invalidAsset(path, `outline node ${index} must be a mapping`)
    for (const key of Object.keys(raw)) if (!NODE_FIELDS.has(key)) invalidAsset(path, `outline node has unsupported field ${JSON.stringify(key)}`)
    const id = authoredString(raw['id'], 'outline node id', path, MAX_ID_UNITS)
    if (ids.has(id)) invalidAsset(path, `outline node id ${JSON.stringify(id)} is duplicated`)
    ids.add(id)
    const node: OutlineNode = {
      id,
      title: authoredString(raw['title'], 'outline node title', path, MAX_TITLE_UNITS),
      ...optionalNodeField(raw, 'summary', path),
      ...optionalNodeField(raw, 'goal', path),
      ...optionalNodeField(raw, 'conflict', path),
      ...optionalNodeField(raw, 'turn', path),
      children: parseNodes(raw['children'] ?? [], path, ids, depth + 1, count),
    }
    return node
  })
}

function optionalNodeField<K extends 'summary' | 'goal' | 'conflict' | 'turn'>(
  raw: Readonly<Record<string, unknown>>,
  field: K,
  path: string,
): Partial<Pick<OutlineNode, K>> {
  const value = raw[field]
  if (value === undefined) return {}
  return { [field]: authoredString(value, `outline node ${field}`, path, MAX_FIELD_UNITS) } as Pick<OutlineNode, K>
}

function outlineContent(value: unknown, path: string): PlanningOutlineContent {
  if (!isRecord(value) || value['kind'] !== 'outline') invalidAsset(path, 'outline content must be a typed outline value')
  const ids = new Set<string>()
  let count = 0
  const nodes = parseNodes(value['nodes'], path, ids, 1, () => {
    count += 1
    if (count > MAX_NODES) invalidAsset(path, `outline contains more than ${MAX_NODES} nodes`)
  })
  return { kind: 'outline', nodes }
}

function outlineSelectionInput(value: unknown): OutlineNodeSelectionInput {
  if (!isRecord(value) || value['kind'] !== 'outline-node' || typeof value['nodeId'] !== 'string') {
    invalidSelection('selection must name one outline node')
  }
  return { kind: 'outline-node', nodeId: value['nodeId'] }
}

function outlineSelector(value: unknown): OutlineNodeSelector {
  if (!isRecord(value) || value['kind'] !== 'outline-node' || typeof value['nodeId'] !== 'string'
    || !isContentHash(value['nodeHash'])) invalidChangeSet('outline node selector is invalid')
  return { kind: 'outline-node', nodeId: value['nodeId'], nodeHash: value['nodeHash'] }
}

function outlineChanges(value: unknown, owner: string): OutlineNodeChanges {
  if (!isRecord(value)) invalidChangeSet(`${owner} changes must be a mapping`)
  const keys = Object.keys(value)
  if (keys.length === 0) invalidChangeSet(`${owner} changes must contain at least one field`)
  for (const key of keys) if (!CHANGE_FIELDS.has(key)) invalidChangeSet(`${owner} changes contain unsupported field ${JSON.stringify(key)}`)
  const result: Record<string, string | null> = {}
  for (const key of keys) {
    const field = key as keyof OutlineNodeChanges
    const candidate = value[key]
    if (field === 'title') {
      if (typeof candidate !== 'string') invalidChangeSet('outline node title change must be a string')
      result[field] = validatedField(candidate, 'outline node title', MAX_TITLE_UNITS)
    } else {
      if (candidate === null) result[field] = null
      else if (typeof candidate === 'string') result[field] = validatedField(candidate, `outline node ${field}`, MAX_FIELD_UNITS)
      else invalidChangeSet(`outline node ${field} change must be a string or null`)
    }
  }
  return result
}

function outlineOperations(value: unknown): readonly UpdateOutlineNodeOperation[] {
  if (!Array.isArray(value)) invalidChangeSet('operations must be an array')
  return value.map((raw) => {
    if (!isRecord(raw) || raw['kind'] !== 'update-outline-node') invalidChangeSet('operation is not supported by planning.outline')
    return {
      kind: 'update-outline-node',
      selector: outlineSelector(raw['selector']),
      changes: outlineChanges(raw['changes'], 'durable operation'),
    }
  })
}

function applyNodeChanges(node: OutlineNode, changes: OutlineNodeChanges): OutlineNode {
  const optional = (field: 'summary' | 'goal' | 'conflict' | 'turn'): string | undefined => {
    if (!(field in changes)) return node[field]
    return changes[field] ?? undefined
  }
  const summary = optional('summary')
  const goal = optional('goal')
  const conflict = optional('conflict')
  const turn = optional('turn')
  return {
    id: node.id,
    title: changes.title ?? node.title,
    ...(summary === undefined ? {} : { summary }),
    ...(goal === undefined ? {} : { goal }),
    ...(conflict === undefined ? {} : { conflict }),
    ...(turn === undefined ? {} : { turn }),
    children: node.children,
  }
}

function updateNode(
  nodes: readonly OutlineNode[],
  nodeId: string,
  update: (node: OutlineNode) => OutlineNode,
): readonly OutlineNode[] {
  return nodes.map(node => node.id === nodeId
    ? update(node)
    : { ...node, children: updateNode(node.children, nodeId, update) })
}

function findNode(nodes: readonly OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const child = findNode(node.children, nodeId)
    if (child !== undefined) return child
  }
}

function hashNode(node: OutlineNode): ContentHash {
  return `sha256:${createHash('sha256').update(JSON.stringify(serializeNode(node))).digest('hex')}`
}

function serializeNode(node: OutlineNode): Record<string, unknown> {
  return {
    id: node.id,
    title: node.title,
    ...(node.summary === undefined ? {} : { summary: node.summary }),
    ...(node.goal === undefined ? {} : { goal: node.goal }),
    ...(node.conflict === undefined ? {} : { conflict: node.conflict }),
    ...(node.turn === undefined ? {} : { turn: node.turn }),
    children: node.children.map(serializeNode),
  }
}

function materialization(text: string, snapshot: AssetSnapshot): NovelAssetMaterialization {
  const serializedUtf8 = new TextEncoder().encode(text)
  const parsed = parseOutline(serializedUtf8, snapshot.asset.projectRelativePath)
  if (parsed.id !== snapshot.asset.id) invalidChangeSet('materialization changed the asset identity')
  return { serializedUtf8, parsed }
}

function parsedNovel(value: Readonly<Record<string, unknown>>, path: string): Readonly<Record<string, unknown>> {
  const novel = value['novel']
  if (!isRecord(novel)) invalidAsset(path, 'novel must be a mapping')
  return novel
}

function outlineTitle(value: unknown, path: string): string {
  return authoredString(value, 'novel.title', path, MAX_TITLE_UNITS)
}

function authoredString(value: unknown, field: string, path: string, maxUnits: number): string {
  if (typeof value !== 'string') invalidAsset(path, `${field} must be a string`)
  try {
    return validatedField(value, field, maxUnits)
  } catch (error: unknown) {
    invalidAsset(path, error instanceof Error ? error.message : String(error), error)
  }
}

function validatedField(value: string, field: string, maxUnits: number): string {
  if (value.trim().length === 0 || value !== value.trim()) throw new Error(`${field} must be non-empty without surrounding whitespace`)
  if (value.length > maxUnits) throw new Error(`${field} must contain at most ${maxUnits} UTF-16 code units`)
  if (containsControl(value) || containsUnpairedSurrogate(value)) throw new Error(`${field} contains invalid characters`)
  return value
}

function isContentHash(value: unknown): value is ContentHash {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)
}

function containsControl(value: string): boolean {
  return /[\u0000-\u001F\u007F]/u.test(value)
}

function containsControlDeep(value: unknown): boolean {
  if (typeof value === 'string') return containsControl(value)
  if (Array.isArray(value)) return value.some(containsControlDeep)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => containsControl(key) || containsControlDeep(child))
}

function containsUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xDC00 || next > 0xDFFF) return true
      index += 1
    } else if (code >= 0xDC00 && code <= 0xDFFF) return true
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidAsset(path: string, detail: string, cause?: unknown): never {
  throw new NovelRepositoryError(
    `novel repository: invalid asset ${JSON.stringify(path)}: ${detail}`,
    'NOVEL_ASSET_INVALID',
    cause === undefined ? undefined : { cause },
  )
}

function invalidSelection(detail: string): never {
  throw new NovelRepositoryError(`novel repository: invalid outline selection: ${detail}`, 'NOVEL_SELECTION_INVALID')
}

function invalidChangeSet(detail: string): never {
  throw new NovelRepositoryError(`novel repository: invalid ChangeSet: ${detail}`, 'NOVEL_CHANGESET_INVALID')
}
