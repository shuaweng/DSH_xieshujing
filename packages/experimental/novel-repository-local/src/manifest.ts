/** Parse and validate the authored `novel.yaml` project declaration. */

import { parseDocument, stringify } from 'yaml'
import {
  NovelRepositoryError,
  ProjectId,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type { ProjectId as ProjectIdValue } from '@deepseek-ai/dsh-experimental-novel-repository/types'

const MAX_CONTENT_ROOTS = 32

/** Validated provider-internal form before content-root resolution. */
export interface ParsedProjectManifest {
  readonly schema: 1
  readonly id: ProjectIdValue
  readonly title: string
  readonly contentRoots: Readonly<Record<string, string>>
}

/**
 * Serialize the repository-owned version-one project manifest deterministically.
 * @param value - Validated project identity, title, and content-root paths.
 * @returns the complete YAML marker text written by project initialization.
 */
export function serializeProjectManifest(value: ParsedProjectManifest): string {
  return stringify({
    kind: 'novel-project',
    schema: value.schema,
    id: value.id,
    title: value.title,
    contentRoots: value.contentRoots,
  }, { lineWidth: 0 })
}

/** Whether a parsed YAML value is a plain record candidate. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a scalar contains a C0 or DEL control character. */
function containsControlCharacter(value: string): boolean {
  return /[\u0000-\u001F\u007F]/u.test(value)
}

/** Whether any decoded YAML key or string value contains a control character. */
function containsControlCharacterDeep(value: unknown): boolean {
  if (typeof value === 'string') return containsControlCharacter(value)
  if (Array.isArray(value)) return value.some(containsControlCharacterDeep)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) =>
    containsControlCharacter(key) || containsControlCharacterDeep(child))
}

/** Raise one stable invalid-manifest diagnostic. */
function invalid(path: string, detail: string, cause?: unknown): never {
  throw new NovelRepositoryError(
    `novel repository: invalid project manifest "${path}": ${detail}`,
    'NOVEL_PROJECT_MANIFEST_INVALID',
    cause === undefined ? undefined : { cause },
  )
}

/**
 * Parse a unique-key, alias-free version-one Novel Project manifest.
 *
 * @param text - UTF-8 manifest text after transport-level validation.
 * @param path - Display path used in stable validation diagnostics.
 * @returns The validated provider-internal project declaration.
 */
export function parseProjectManifest(text: string, path: string): ParsedProjectManifest {
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true })
  const [firstError] = document.errors
  if (firstError !== undefined) invalid(path, firstError.message, firstError)
  const [firstWarning] = document.warnings
  if (firstWarning !== undefined) invalid(path, firstWarning.message, firstWarning)

  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 0 })
  } catch (error) {
    invalid(path, 'YAML aliases are not supported', error)
  }
  if (containsControlCharacterDeep(value)) {
    invalid(path, 'the document must not contain control characters')
  }
  if (!isRecord(value)) invalid(path, 'the document root must be a mapping')
  if (value['kind'] !== 'novel-project') invalid(path, 'kind must be "novel-project"')

  const schema = value['schema']
  if (typeof schema === 'number' && Number.isSafeInteger(schema) && schema !== 1) {
    throw new NovelRepositoryError(
      `novel repository: project manifest "${path}" uses unsupported schema ${schema}`,
      'NOVEL_PROJECT_SCHEMA_UNSUPPORTED',
    )
  }
  if (schema !== 1) invalid(path, 'schema must be the integer 1')

  const id = value['id']
  if (
    typeof id !== 'string'
    || id.trim().length === 0
    || id.trim() !== id
  ) {
    invalid(path, 'id must be a non-empty string without surrounding whitespace or control characters')
  }
  const title = value['title']
  if (typeof title !== 'string' || title.trim().length === 0) {
    invalid(path, 'title must be a non-empty string without control characters')
  }

  const contentRoots = value['contentRoots']
  if (!isRecord(contentRoots)) invalid(path, 'contentRoots must be a mapping')
  if (typeof contentRoots['manuscript'] !== 'string') {
    invalid(path, 'contentRoots.manuscript must be a path string')
  }
  const contentRootEntries = Object.entries(contentRoots)
  if (contentRootEntries.length > MAX_CONTENT_ROOTS) {
    invalid(path, `contentRoots must contain at most ${MAX_CONTENT_ROOTS} entries`)
  }
  const roots: Record<string, string> = {}
  for (const [name, root] of contentRootEntries) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      invalid(path, `content root name ${JSON.stringify(name)} is invalid`)
    }
    if (typeof root !== 'string' || root.trim().length === 0) {
      invalid(path, `contentRoots.${name} must be a non-empty path string without control characters`)
    }
    roots[name] = root
  }

  return { schema: 1, id: ProjectId(id), title, contentRoots: roots }
}
