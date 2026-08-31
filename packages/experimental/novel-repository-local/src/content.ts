/** Strict authored-file type declaration parsing and the built-in manuscript Asset definition. */

import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { isScalar, parseDocument, stringify } from 'yaml'
import {
  AssetId,
  NovelRepositoryError,
  type AssetSnapshot,
  type ContentHash,
  type InsertTextOperation,
  type ManuscriptChapterContent,
  type ReplaceTextOperation,
  type UpdateTitleOperation,
  type TextRangeSelectionInput,
  type TextRangeSelector,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type {
  NovelAssetMaterialization,
  NovelAssetTypeDefinition,
  ParsedNovelAsset,
} from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'

interface ParsedFrontmatterFile {
  readonly text: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly novel: Readonly<Record<string, unknown>>
  readonly bodyStartUtf16: number
}

interface ManuscriptSource {
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

function invalidAsset(path: string, detail: string, cause?: unknown): never {
  throw new NovelRepositoryError(
    `novel repository: invalid asset ${JSON.stringify(path)}: ${detail}`,
    'NOVEL_ASSET_INVALID',
    cause === undefined ? undefined : { cause },
  )
}

function invalidChangeSet(detail: string): never {
  throw new NovelRepositoryError(`novel repository: invalid ChangeSet: ${detail}`, 'NOVEL_CHANGESET_INVALID')
}

function closingFrontmatter(text: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? text.length : newline
    const line = text.slice(lineStart, lineEnd).replace(/\r$/u, '')
    if (line === '---') return { start: lineStart, bodyStart: newline < 0 ? text.length : newline + 1 }
    if (newline < 0) return undefined
    lineStart = newline + 1
  }
}

function parseFrontmatterFile(bytes: Uint8Array, path: string): ParsedFrontmatterFile {
  if (bytes.includes(0)) invalidAsset(path, 'the file contains a NUL byte')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    invalidAsset(path, 'the file is not valid UTF-8', error)
  }
  const firstNewline = text.indexOf('\n')
  if (firstNewline < 0 || text.slice(0, firstNewline).replace(/\r$/u, '') !== '---') {
    invalidAsset(path, 'the file must start with YAML Frontmatter')
  }
  const closing = closingFrontmatter(text, firstNewline + 1)
  if (closing === undefined) invalidAsset(path, 'the YAML Frontmatter is not closed')
  const document = parseDocument(text.slice(firstNewline + 1, closing.start), {
    prettyErrors: true,
    uniqueKeys: true,
  })
  const [firstError] = document.errors
  if (firstError !== undefined) invalidAsset(path, firstError.message, firstError)
  const [firstWarning] = document.warnings
  if (firstWarning !== undefined) invalidAsset(path, firstWarning.message, firstWarning)
  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 0 })
  } catch (error: unknown) {
    invalidAsset(path, 'YAML aliases are not supported', error)
  }
  if (!isRecord(value)) invalidAsset(path, 'the Frontmatter root must be a mapping')
  if (containsControlCharacterDeep(value)) invalidAsset(path, 'Frontmatter must not contain control characters')
  const novel = value['novel']
  if (!isRecord(novel)) invalidAsset(path, 'novel must be a mapping')
  const schema = novel['schema']
  if (typeof schema === 'number' && Number.isSafeInteger(schema) && schema !== 1) {
    throw new NovelRepositoryError(
      `novel repository: asset ${JSON.stringify(path)} uses unsupported schema ${schema}`,
      'NOVEL_PROJECT_SCHEMA_UNSUPPORTED',
    )
  }
  if (schema !== 1) invalidAsset(path, 'novel.schema must be the integer 1')
  return { text, frontmatter: value, novel, bodyStartUtf16: closing.bodyStart }
}

/**
 * Read the semantic type before dispatching to its registered parser.
 * @param bytes - complete authored file bytes.
 * @param path - project-relative path used in diagnostics.
 * @returns the exact declared Markdown Frontmatter or YAML root type string.
 */
export function declaredAssetType(bytes: Uint8Array, path: string): string {
  const extension = extname(path).toLocaleLowerCase()
  const declaration = extension === '.yaml' || extension === '.yml'
    ? parseYamlDeclaration(bytes, path)
    : parseFrontmatterFile(bytes, path).novel
  const type = declaration['type']
  if (typeof type !== 'string' || type.length === 0 || type.trim() !== type) {
    invalidAsset(path, 'novel.type must be a non-empty string without surrounding whitespace')
  }
  return type
}

/** Parse only the shared identity mapping required to dispatch one YAML Asset. */
function parseYamlDeclaration(bytes: Uint8Array, path: string): Readonly<Record<string, unknown>> {
  if (bytes.includes(0)) invalidAsset(path, 'the file contains a NUL byte')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    invalidAsset(path, 'the file is not valid UTF-8', error)
  }
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true })
  const [firstError] = document.errors
  if (firstError !== undefined) invalidAsset(path, firstError.message, firstError)
  const [firstWarning] = document.warnings
  if (firstWarning !== undefined) invalidAsset(path, firstWarning.message, firstWarning)
  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 0 })
  } catch (error: unknown) {
    invalidAsset(path, 'YAML aliases are not supported', error)
  }
  if (!isRecord(value)) invalidAsset(path, 'the YAML root must be a mapping')
  if (containsControlCharacterDeep(value)) invalidAsset(path, 'YAML assets must not contain control characters')
  const novel = value['novel']
  if (!isRecord(novel)) invalidAsset(path, 'novel must be a mapping')
  const schema = novel['schema']
  if (typeof schema === 'number' && Number.isSafeInteger(schema) && schema !== 1) {
    throw new NovelRepositoryError(
      `novel repository: asset ${JSON.stringify(path)} uses unsupported schema ${schema}`,
      'NOVEL_PROJECT_SCHEMA_UNSUPPORTED',
    )
  }
  if (schema !== 1) invalidAsset(path, 'novel.schema must be the integer 1')
  return novel
}

/**
 * Parse one exact UTF-8 manuscript chapter serialization.
 * @param bytes - complete authored chapter bytes.
 * @param path - project-relative path used in diagnostics.
 * @returns the validated typed chapter and type-private source offsets.
 */
export function parseChapter(bytes: Uint8Array, path: string): ParsedNovelAsset {
  const parsed = parseFrontmatterFile(bytes, path)
  if (parsed.novel['type'] !== 'manuscript.chapter') {
    invalidAsset(path, 'novel.type must be "manuscript.chapter"')
  }
  const id = parsed.novel['id']
  if (typeof id !== 'string' || id.trim().length === 0 || id.trim() !== id) {
    invalidAsset(path, 'novel.id must be a non-empty string without surrounding whitespace')
  }
  const title = parsed.novel['title']
  if (typeof title !== 'string' || title.trim().length === 0) {
    invalidAsset(path, 'novel.title must be a non-empty string')
  }
  return {
    id: AssetId(id),
    type: 'manuscript.chapter',
    title,
    frontmatter: parsed.frontmatter,
    content: { kind: 'manuscript', body: parsed.text.slice(parsed.bodyStartUtf16) },
    source: { bodyStartUtf16: parsed.bodyStartUtf16 } satisfies ManuscriptSource,
  }
}

/** Built-in `manuscript.chapter` Host contribution. */
export const manuscriptChapterTypeDefinition: NovelAssetTypeDefinition = {
  type: 'manuscript.chapter',
  contentRoot: 'manuscript',
  requiredContentRoot: true,
  extensions: ['.md'],
  model: {
    description: 'A Markdown manuscript chapter addressed by exact UTF-16 body offsets.',
    creationInstructions: 'Create content {"kind":"manuscript","body":"<complete Markdown chapter prose>"} without parent_asset_id. When the author already supplied or requested prose, write the complete body in this call instead of asking them to create an empty chapter first.',
    proposalInstructions: 'To rename the chapter, use {"kind":"update-title","title":"..."}. To write into an empty chapter or add text, use {"kind":"insert-text","atUtf16":<integer>,"text":"..."}. To rewrite existing text, use {"kind":"replace-text","startUtf16":<integer>,"endUtf16":<integer>,"replacement":"..."}. Submit one operation, or combine one update-title plus one text operation in the same operations array for one atomic ChangeSet. Offsets address the exact body returned by novel_get; insert-text may use 0 for an empty body or the body length to append.',
  },
  parse: parseChapter,
  create(request, path) {
    if (request.parentId !== undefined) invalidAsset(path, 'manuscript chapter must not declare novel.parent')
    const chapter = chapterContent(request.content)
    if (containsUnpairedSurrogate(chapter.body)) invalidAsset(path, 'chapter body contains an unpaired UTF-16 surrogate')
    const frontmatter = stringify({
      novel: {
        schema: 1,
        id: request.id,
        type: 'manuscript.chapter',
        title: validatedChapterTitle(request.title, path),
      },
    }).trimEnd()
    const serializedUtf8 = new TextEncoder().encode(`---\n${frontmatter}\n---\n${chapter.body}`)
    return { serializedUtf8, parsed: parseChapter(serializedUtf8, path) }
  },
  serializeContent(snapshot, content, title) {
    const chapter = chapterContent(content)
    if (containsUnpairedSurrogate(chapter.body)) invalidAsset(snapshot.asset.projectRelativePath, 'chapter body contains an unpaired UTF-16 surrogate')
    const parsedBase = parseChapter(snapshot.serializedUtf8, snapshot.asset.projectRelativePath)
    const source = manuscriptSource(parsedBase)
    const beforeText = new TextDecoder().decode(snapshot.serializedUtf8)
    const withBody = `${beforeText.slice(0, source.bodyStartUtf16)}${chapter.body}`
    return materialization(
      title === undefined ? withBody : replaceFrontmatterTitle(withBody, snapshot.asset.projectRelativePath, title),
      snapshot,
    )
  },
  captureSelection(snapshot, input, options) {
    const chapter = chapterContent(snapshot.content)
    const range = textRangeInput(input)
    const { startUtf16, endUtf16 } = range
    if (
      !Number.isSafeInteger(startUtf16)
      || !Number.isSafeInteger(endUtf16)
      || startUtf16 < 0
      || endUtf16 <= startUtf16
      || endUtf16 > chapter.body.length
      || splitsSurrogatePair(chapter.body, startUtf16)
      || splitsSurrogatePair(chapter.body, endUtf16)
    ) invalidSelection()
    const quote = chapter.body.slice(startUtf16, endUtf16)
    const preview = boundedSlice(quote, options.previewUnits)
    return {
      selector: {
        kind: 'text-range',
        startUtf16,
        endUtf16,
        quoteHash: contentHash(new TextEncoder().encode(quote)),
        ...boundedBefore(chapter.body, startUtf16, options.contextUnits),
        ...boundedAfter(chapter.body, endUtf16, options.contextUnits),
      },
      ...(preview === undefined ? {} : { preview }),
    }
  },
  modelText(snapshot, selector) {
    const body = chapterContent(snapshot.content).body
    if (selector === undefined) return body
    const range = textRangeSelector(selector)
    const { startUtf16, endUtf16 } = range
    if (
      !Number.isSafeInteger(startUtf16)
      || !Number.isSafeInteger(endUtf16)
      || startUtf16 < 0
      || endUtf16 <= startUtf16
      || endUtf16 > body.length
      || splitsSurrogatePair(body, startUtf16)
      || splitsSurrogatePair(body, endUtf16)
    ) invalidSelection()
    const selected = body.slice(startUtf16, endUtf16)
    if (contentHash(new TextEncoder().encode(selected)) !== range.quoteHash) invalidSelection()
    return selected
  },
  prepareOperations(snapshot, value) {
    if (!Array.isArray(value)) invalidChangeSet('operations must be an array')
    const body = chapterContent(snapshot.content).body
    const prepared = value.map((operation: unknown): ManuscriptOperation => {
      if (isRecord(operation) && operation['kind'] === 'update-title') {
        if (typeof operation['title'] !== 'string') invalidChangeSet('model operation is not a valid update-title input')
        return { kind: 'update-title', title: validatedChapterTitle(operation['title'], snapshot.asset.projectRelativePath) }
      }
      if (isRecord(operation) && operation['kind'] === 'insert-text') {
        if (!Number.isSafeInteger(operation['atUtf16']) || typeof operation['text'] !== 'string') {
          invalidChangeSet('model operation is not a valid insert-text input')
        }
        const atUtf16 = validatedInsertionOffset(body, operation['atUtf16'] as number)
        if (containsUnpairedSurrogate(operation['text'])) invalidChangeSet('inserted text contains an unpaired UTF-16 surrogate')
        return { kind: 'insert-text', atUtf16, text: operation['text'] }
      }
      if (!isRecord(operation) || operation['kind'] !== 'replace-text'
        || !Number.isSafeInteger(operation['startUtf16']) || !Number.isSafeInteger(operation['endUtf16'])
        || typeof operation['replacement'] !== 'string') {
        invalidChangeSet('model operation is not supported by manuscript.chapter')
      }
      const captured = this.captureSelection(snapshot, {
        kind: 'text-range',
        startUtf16: operation['startUtf16'] as number,
        endUtf16: operation['endUtf16'] as number,
      }, { contextUnits: 0, previewUnits: 1 })
      return {
        kind: 'replace-text',
        selector: textRangeSelector(captured.selector),
        replacement: operation['replacement'],
      }
    })
    return validatedManuscriptOperations(prepared)
  },
  decodeOperations(value) {
    if (!Array.isArray(value)) invalidChangeSet('operations must be an array')
    const decoded = value.map((operation: unknown): ManuscriptOperation => {
      if (isRecord(operation) && operation['kind'] === 'update-title') {
        if (typeof operation['title'] !== 'string') invalidChangeSet('update-title operation is invalid')
        return { kind: 'update-title', title: operation['title'] }
      }
      if (isRecord(operation) && operation['kind'] === 'insert-text') {
        if (!Number.isSafeInteger(operation['atUtf16']) || typeof operation['text'] !== 'string') {
          invalidChangeSet('insert-text operation is invalid')
        }
        return { kind: 'insert-text', atUtf16: operation['atUtf16'] as number, text: operation['text'] }
      }
      if (!isRecord(operation) || operation['kind'] !== 'replace-text' || typeof operation['replacement'] !== 'string') {
        invalidChangeSet('operation is not supported by manuscript.chapter')
      }
      return {
        kind: 'replace-text',
        selector: decodeTextRangeSelector(operation['selector']),
        replacement: operation['replacement'],
      }
    })
    return validatedManuscriptOperations(decoded)
  },
  materializeOperations(snapshot, operations) {
    const decoded = manuscriptOperations(operations)
    const title = decoded.find((operation): operation is UpdateTitleOperation => operation.kind === 'update-title')?.title
    const operation = decoded.find((candidate): candidate is ReplaceTextOperation | InsertTextOperation => candidate.kind !== 'update-title')
    const body = chapterContent(snapshot.content).body
    if (operation === undefined) return this.serializeContent(snapshot, { kind: 'manuscript', body }, title)
    if (operation.kind === 'insert-text') {
      if (containsUnpairedSurrogate(operation.text)) invalidChangeSet('inserted text contains an unpaired UTF-16 surrogate')
      const atUtf16 = validatedInsertionOffset(body, operation.atUtf16)
      return this.serializeContent(snapshot, {
        kind: 'manuscript',
        body: `${body.slice(0, atUtf16)}${operation.text}${body.slice(atUtf16)}`,
      }, title)
    }
    if (containsUnpairedSurrogate(operation.replacement)) invalidChangeSet('replacement contains an unpaired UTF-16 surrogate')
    const { startUtf16, endUtf16, quoteHash } = operation.selector
    if (
      !Number.isSafeInteger(startUtf16)
      || !Number.isSafeInteger(endUtf16)
      || startUtf16 < 0
      || endUtf16 <= startUtf16
      || endUtf16 > body.length
      || splitsSurrogatePair(body, startUtf16)
      || splitsSurrogatePair(body, endUtf16)
    ) invalidChangeSet('replace-text selector is outside the retained body')
    if (contentHash(new TextEncoder().encode(body.slice(startUtf16, endUtf16))) !== quoteHash) {
      invalidChangeSet('replace-text quote hash does not match the retained Revision')
    }
    return this.serializeContent(snapshot, {
      kind: 'manuscript',
      body: `${body.slice(0, startUtf16)}${operation.replacement}${body.slice(endUtf16)}`,
    }, title)
  },
}

/** Replace only the parsed `novel.title` scalar so author comments and key order remain byte-stable. */
function replaceFrontmatterTitle(text: string, path: string, title: string): string {
  const validatedTitle = validatedChapterTitle(title, path)
  const firstNewline = text.indexOf('\n')
  const closing = firstNewline < 0 ? undefined : closingFrontmatter(text, firstNewline + 1)
  if (firstNewline < 0 || closing === undefined) invalidAsset(path, 'the YAML Frontmatter is not closed')
  const yamlStart = firstNewline + 1
  const document = parseDocument(text.slice(yamlStart, closing.start), {
    prettyErrors: true,
    uniqueKeys: true,
  })
  const titleNode = document.getIn(['novel', 'title'], true)
  if (!isScalar(titleNode) || titleNode.range == null) invalidAsset(path, 'novel.title must be a scalar string')
  const [start, end] = titleNode.range
  const serializedTitle = stringify(validatedTitle).trimEnd()
  return `${text.slice(0, yamlStart + start)}${serializedTitle}${text.slice(yamlStart + end)}`
}

function validatedChapterTitle(title: string, path: string): string {
  if (title.trim().length === 0 || title.trim() !== title) {
    invalidAsset(path, 'novel.title must be a non-empty string without surrounding whitespace')
  }
  if (title.length > 240) invalidAsset(path, 'novel.title must contain at most 240 UTF-16 code units')
  if (containsControlCharacter(title) || containsUnpairedSurrogate(title)) {
    invalidAsset(path, 'novel.title contains invalid characters')
  }
  return title
}

/**
 * Hash exact UTF-8 bytes using the canonical lowercase SHA-256 encoding.
 * @param bytes - exact bytes whose immutable content identity is required.
 * @returns the branded lowercase SHA-256 content hash.
 */
export function contentHash(bytes: Uint8Array): ContentHash {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

/**
 * Test whether an offset splits a UTF-16 surrogate pair.
 * @param text - JavaScript string addressed in UTF-16 code units.
 * @param offset - candidate UTF-16 boundary.
 * @returns whether the boundary lies between a paired high and low surrogate.
 */
export function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false
  const before = text.charCodeAt(offset - 1)
  const after = text.charCodeAt(offset)
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF
}

/**
 * Test whether a JavaScript string contains an unpaired surrogate.
 * @param text - JavaScript string to validate.
 * @returns whether any high or low surrogate lacks its matching pair.
 */
export function containsUnpairedSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xD800 && code <= 0xDBFF) {
      if (index + 1 >= text.length) return true
      const next = text.charCodeAt(index + 1)
      if (next < 0xDC00 || next > 0xDFFF) return true
      index += 1
    } else if (code >= 0xDC00 && code <= 0xDFFF) return true
  }
  return false
}

function materialization(text: string, snapshot: AssetSnapshot): NovelAssetMaterialization {
  const serializedUtf8 = new TextEncoder().encode(text)
  const parsed = parseChapter(serializedUtf8, snapshot.asset.projectRelativePath)
  if (parsed.id !== snapshot.asset.id) invalidChangeSet('materialization changed the asset identity')
  return { serializedUtf8, parsed }
}

function manuscriptSource(parsed: ParsedNovelAsset): ManuscriptSource {
  if (!isRecord(parsed.source) || !Number.isSafeInteger(parsed.source['bodyStartUtf16'])) {
    invalidAsset('<retained-revision>', 'manuscript serialization state is invalid')
  }
  return { bodyStartUtf16: parsed.source['bodyStartUtf16'] as number }
}

function chapterContent(content: unknown): ManuscriptChapterContent {
  if (!isRecord(content) || content['kind'] !== 'manuscript' || typeof content['body'] !== 'string') {
    invalidAsset('<asset-content>', 'chapter content is invalid')
  }
  return { kind: 'manuscript', body: content['body'] }
}

function textRangeInput(input: unknown): TextRangeSelectionInput {
  if (!isRecord(input) || input['kind'] !== 'text-range'
    || typeof input['startUtf16'] !== 'number' || typeof input['endUtf16'] !== 'number') invalidSelection()
  return { kind: 'text-range', startUtf16: input['startUtf16'], endUtf16: input['endUtf16'] }
}

function textRangeSelector(selector: unknown): TextRangeSelector {
  try {
    return decodeTextRangeSelector(selector)
  } catch {
    return invalidSelection()
  }
}

function decodeTextRangeSelector(value: unknown): TextRangeSelector {
  if (
    !isRecord(value)
    || value['kind'] !== 'text-range'
    || !Number.isSafeInteger(value['startUtf16'])
    || !Number.isSafeInteger(value['endUtf16'])
    || typeof value['quoteHash'] !== 'string'
    || (value['prefix'] !== undefined && typeof value['prefix'] !== 'string')
    || (value['suffix'] !== undefined && typeof value['suffix'] !== 'string')
  ) invalidChangeSet('replace-text selector is invalid')
  return {
    kind: 'text-range',
    startUtf16: value['startUtf16'] as number,
    endUtf16: value['endUtf16'] as number,
    quoteHash: value['quoteHash'] as ContentHash,
    ...(value['prefix'] === undefined ? {} : { prefix: value['prefix'] }),
    ...(value['suffix'] === undefined ? {} : { suffix: value['suffix'] }),
  }
}

type ManuscriptOperation = ReplaceTextOperation | InsertTextOperation | UpdateTitleOperation

function manuscriptOperations(operations: unknown): readonly ManuscriptOperation[] {
  if (!Array.isArray(operations)) invalidChangeSet('operations must be an array')
  const decoded = operations.map((operation: unknown): ManuscriptOperation => {
    if (isRecord(operation) && operation['kind'] === 'update-title') {
      if (typeof operation['title'] !== 'string') invalidChangeSet('update-title operation is invalid')
      return { kind: 'update-title', title: operation['title'] }
    }
    if (isRecord(operation) && operation['kind'] === 'insert-text') {
      if (!Number.isSafeInteger(operation['atUtf16']) || typeof operation['text'] !== 'string') {
        invalidChangeSet('insert-text operation is invalid')
      }
      return { kind: 'insert-text', atUtf16: operation['atUtf16'] as number, text: operation['text'] }
    }
    if (!isRecord(operation) || operation['kind'] !== 'replace-text' || typeof operation['replacement'] !== 'string') {
      invalidChangeSet('operation is not supported by manuscript.chapter')
    }
    return {
      kind: 'replace-text',
      selector: decodeTextRangeSelector(operation['selector']),
      replacement: operation['replacement'],
    }
  })
  return validatedManuscriptOperations(decoded)
}

function validatedManuscriptOperations(operations: readonly ManuscriptOperation[]): readonly ManuscriptOperation[] {
  if (operations.length < 1 || operations.length > 2) {
    invalidChangeSet('manuscript operations must contain one item, or one update-title plus one text operation')
  }
  const titleCount = operations.filter(operation => operation.kind === 'update-title').length
  const textCount = operations.length - titleCount
  if (titleCount > 1 || textCount > 1) {
    invalidChangeSet('manuscript operations may contain at most one update-title and one text operation')
  }
  return operations
}

function validatedInsertionOffset(body: string, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > body.length || splitsSurrogatePair(body, offset)) {
    invalidChangeSet('insert-text offset is outside the retained body or splits a Unicode code point')
  }
  return offset
}

function invalidSelection(): never {
  throw new NovelRepositoryError(
    'novel repository: selection must be a non-empty UTF-16 range on code-point boundaries with matching retained text',
    'NOVEL_SELECTION_INVALID',
  )
}

function boundedBefore(text: string, offset: number, limit: number): Pick<TextRangeSelector, 'prefix'> {
  let start = Math.max(0, offset - limit)
  if (splitsSurrogatePair(text, start)) start += 1
  const value = text.slice(start, offset)
  return value === '' ? {} : { prefix: value }
}

function boundedAfter(text: string, offset: number, limit: number): Pick<TextRangeSelector, 'suffix'> {
  let end = Math.min(text.length, offset + limit)
  if (splitsSurrogatePair(text, end)) end -= 1
  const value = text.slice(offset, end)
  return value === '' ? {} : { suffix: value }
}

function boundedSlice(text: string, limit: number): string | undefined {
  if (text === '') return undefined
  if (text.length <= limit) return text
  const end = splitsSurrogatePair(text, limit) ? limit - 1 : limit
  return `${text.slice(0, end)}…`
}
