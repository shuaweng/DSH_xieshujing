/** Exact UTF-8 hashing and strict version-one chapter Frontmatter parsing. */

import { createHash } from 'node:crypto'
import { parseDocument } from 'yaml'
import {
  AssetId,
  NovelRepositoryError,
  type ContentHash,
} from '@deepseek-ai/dsh-experimental-novel-repository'

/** Parsed authored chapter while preserving its exact serialization prefix. */
export interface ParsedChapter {
  readonly id: AssetId
  readonly title: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly body: string
  readonly bodyStartUtf16: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function containsControlCharacter(value: string): boolean {
  return /[\u0000-\u001F\u007F]/u.test(value)
}

function containsControlCharacterDeep(value: unknown): boolean {
  if (typeof value === 'string') return containsControlCharacter(value)
  if (Array.isArray(value)) return value.some(containsControlCharacterDeep)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) =>
    containsControlCharacter(key) || containsControlCharacterDeep(child))
}

function invalid(path: string, detail: string, cause?: unknown): never {
  throw new NovelRepositoryError(
    `novel repository: invalid chapter asset "${path}": ${detail}`,
    'NOVEL_ASSET_INVALID',
    cause === undefined ? undefined : { cause },
  )
}

function closingFrontmatter(text: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? text.length : newline
    const line = text.slice(lineStart, lineEnd).replace(/\r$/u, '')
    if (line === '---') {
      return { start: lineStart, bodyStart: newline < 0 ? text.length : newline + 1 }
    }
    if (newline < 0) return undefined
    lineStart = newline + 1
  }
}

/**
 * Parse one exact UTF-8 chapter serialization.
 * @param bytes - complete authored file bytes after the provider byte bound.
 * @param path - project-relative path used in stable diagnostics.
 * @returns validated Frontmatter, title, stable id, and exact body slice.
 */
export function parseChapter(bytes: Uint8Array, path: string): ParsedChapter {
  if (bytes.includes(0)) invalid(path, 'the file contains a NUL byte')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    invalid(path, 'the file is not valid UTF-8', error)
  }

  const firstNewline = text.indexOf('\n')
  if (firstNewline < 0 || text.slice(0, firstNewline).replace(/\r$/u, '') !== '---') {
    invalid(path, 'the file must start with YAML Frontmatter')
  }
  const closing = closingFrontmatter(text, firstNewline + 1)
  if (closing === undefined) invalid(path, 'the YAML Frontmatter is not closed')
  const document = parseDocument(text.slice(firstNewline + 1, closing.start), {
    prettyErrors: true,
    uniqueKeys: true,
  })
  const [firstError] = document.errors
  if (firstError !== undefined) invalid(path, firstError.message, firstError)
  const [firstWarning] = document.warnings
  if (firstWarning !== undefined) invalid(path, firstWarning.message, firstWarning)

  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 0 })
  } catch (error: unknown) {
    invalid(path, 'YAML aliases are not supported', error)
  }
  if (!isRecord(value)) invalid(path, 'the Frontmatter root must be a mapping')
  if (containsControlCharacterDeep(value)) invalid(path, 'Frontmatter must not contain control characters')
  const novel = value['novel']
  if (!isRecord(novel)) invalid(path, 'novel must be a mapping')
  const schema = novel['schema']
  if (typeof schema === 'number' && Number.isSafeInteger(schema) && schema !== 1) {
    throw new NovelRepositoryError(
      `novel repository: chapter asset "${path}" uses unsupported schema ${schema}`,
      'NOVEL_PROJECT_SCHEMA_UNSUPPORTED',
    )
  }
  if (schema !== 1) invalid(path, 'novel.schema must be the integer 1')
  if (novel['type'] !== 'manuscript.chapter') {
    invalid(path, 'novel.type must be "manuscript.chapter"')
  }
  const id = novel['id']
  if (typeof id !== 'string' || id.trim().length === 0 || id.trim() !== id) {
    invalid(path, 'novel.id must be a non-empty string without surrounding whitespace')
  }
  const title = novel['title']
  if (typeof title !== 'string' || title.trim().length === 0) {
    invalid(path, 'novel.title must be a non-empty string')
  }
  return {
    id: AssetId(id),
    title,
    frontmatter: value,
    body: text.slice(closing.bodyStart),
    bodyStartUtf16: closing.bodyStart,
  }
}

/**
 * Hash exact UTF-8 bytes using the version-one lowercase SHA-256 encoding.
 * @param bytes - complete byte sequence named by the caller.
 * @returns canonical content hash.
 */
export function contentHash(bytes: Uint8Array): ContentHash {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

/**
 * Test whether an offset splits a UTF-16 surrogate pair.
 * @param text - complete JavaScript string.
 * @param offset - UTF-16 offset to inspect.
 * @returns whether the offset falls between a paired high and low surrogate.
 */
export function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false
  const before = text.charCodeAt(offset - 1)
  const after = text.charCodeAt(offset)
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF
}

/**
 * Test whether a JavaScript string contains an unpaired surrogate.
 * @param text - complete JavaScript string to validate before UTF-8 encoding.
 * @returns whether any high or low surrogate lacks its required pair.
 */
export function containsUnpairedSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xD800 && code <= 0xDBFF) {
      if (index + 1 >= text.length) return true
      const next = text.charCodeAt(index + 1)
      if (next < 0xDC00 || next > 0xDFFF) return true
      index += 1
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true
    }
  }
  return false
}
