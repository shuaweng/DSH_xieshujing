/** Freeform book, volume, and chapter planning Asset definitions. */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { isScalar, parseDocument, stringify } from 'yaml'
import {
  AssetId,
  NovelRepositoryError,
  type AssetSnapshot,
  type ContentHash,
  type NovelAssetContent,
  type NovelSelectionInput,
  type NovelSelector,
  type ReplaceTextOperation,
  type TextRangeSelectionInput,
  type TextRangeSelector,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type {
  NovelAssetMaterialization,
  NovelAssetTypeDefinition,
  ParsedNovelAsset,
} from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'
import type {
  BookBriefContent,
  BookStyleProfileContent,
  ChapterOutlineContent,
  PlanningOutlineContent,
  PlanningOutlineLevel,
} from './types.ts'

export type {
  BookBriefContent,
  BookStyleProfileContent,
  ChapterOutlineContent,
  PlanningOutlineContent,
  PlanningOutlineLevel,
} from './types.ts'

export const name = 'novel-asset-outline'
export const inject = ['novelAssetTypes']

interface ParsedFrontmatterFile {
  readonly text: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly novel: Readonly<Record<string, unknown>>
  readonly bodyStartUtf16: number
}

interface PlanningSource {
  readonly bodyStartUtf16: number
}

/** Register freeform outline types for the calling plugin lifetime. */
export function apply(ctx: Context): void {
  ctx.novelAssetTypes.register(planningOutlineTypeDefinition)
  ctx.novelAssetTypes.register(chapterOutlineTypeDefinition)
  ctx.novelAssetTypes.register(bookBriefTypeDefinition)
  ctx.novelAssetTypes.register(bookStyleProfileTypeDefinition)
}

/** Freeform two-level outline Host contribution. */
export const planningOutlineTypeDefinition = {
  type: 'planning.outline',
  contentRoot: 'planning',
  extensions: ['.md'],
  parent: { allowedTypes: ['planning.outline'], maxDepth: 1 },
  model: {
    description: 'A freeform Markdown book outline or volume outline. Its prose, headings, lists, and tables are author-defined.',
    creationInstructions: 'Create content {"kind":"outline","level":"book"|"volume","body":"<free Markdown>"}. A volume outline requires parent_asset_id naming a book outline; a book outline has no parent.',
    proposalInstructions: 'Use one exact operation [{"kind":"replace-text","startUtf16":<integer>,"endUtf16":<integer>,"replacement":"..."}]. Offsets address the free Markdown body returned by novel_get. Do not force goal/conflict/turn fields unless the author asks for that format.',
  },
  parse: parseOutline,
  create(request, path) {
    const content = outlineContent(request.content)
    validateOutlineParent(content.level, request.parentId, path)
    return createdMaterialization(
      request.id,
      request.title,
      'planning.outline',
      request.parentId,
      { level: content.level },
      content.body,
      path,
      parseOutline,
    )
  },
  ...freeformBehavior('outline', outlineBody, parseOutline),
} satisfies NovelAssetTypeDefinition

/** Project-singleton book synopsis and canon guidance. */
export const bookBriefTypeDefinition = freeformBookDefinition({
  type: 'book.brief',
  kind: 'book-brief',
  description: 'The project-singleton freeform Markdown book brief: premise, reader promise, protagonist, conflict, world boundary, long arc, and other author-chosen global facts.',
  creationInstructions: 'Before creating, use novel_list or novel_search to confirm the project has no book.brief. Create content {"kind":"book-brief","body":"<free Markdown>"}. Keep the author\'s own structure; suggested sections are optional.',
  parse: parseBookBrief,
  content: bookBriefContent,
})

/** Project-singleton book prose and serial-rhythm guidance. */
export const bookStyleProfileTypeDefinition = freeformBookDefinition({
  type: 'book.style-profile',
  kind: 'book-style-profile',
  description: 'The project-singleton freeform Markdown style profile: narrative voice, sentence rhythm, dialogue, information release, serial pacing, hooks, positive references, and explicit avoidances.',
  creationInstructions: 'Before creating, use novel_list or novel_search to confirm the project has no book.style-profile. Create content {"kind":"book-style-profile","body":"<free Markdown>"}. Record only author-confirmed guidance; do not infer durable preferences from one draft.',
  parse: parseBookStyleProfile,
  content: bookStyleProfileContent,
})

/** Freeform chapter-plan Host contribution bound one-to-one to a manuscript chapter. */
export const chapterOutlineTypeDefinition = {
  type: 'planning.chapter-outline',
  contentRoot: 'planning',
  extensions: ['.md'],
  parent: { allowedTypes: ['manuscript.chapter'], required: true, singleton: true },
  model: {
    description: 'A freeform Markdown chapter plan bound to one manuscript chapter.',
    creationInstructions: 'Create content {"kind":"chapter-outline","body":"<free Markdown>"} with parent_asset_id naming the target manuscript.chapter. Emotion, hooks, rhythm, and four beats are optional writing methods, never required fields.',
    proposalInstructions: 'Use one exact operation [{"kind":"replace-text","startUtf16":<integer>,"endUtf16":<integer>,"replacement":"..."}]. Offsets address the free Markdown body returned by novel_get.',
  },
  parse: parseChapterOutline,
  create(request, path) {
    const content = chapterContent(request.content)
    if (request.parentId === undefined) invalidAsset(path, 'chapter outline requires novel.parent')
    return createdMaterialization(
      request.id,
      request.title,
      'planning.chapter-outline',
      request.parentId,
      {},
      content.body,
      path,
      parseChapterOutline,
    )
  },
  ...freeformBehavior('chapter-outline', chapterBody, parseChapterOutline),
} satisfies NovelAssetTypeDefinition

/**
 * Parse one freeform book- or volume-outline Markdown file.
 *
 * @param bytes Serialized UTF-8 asset bytes.
 * @param path Project-relative path used in validation diagnostics.
 * @returns One validated freeform outline asset.
 */
export function parseOutline(bytes: Uint8Array, path: string): ParsedNovelAsset {
  const parsed = parsePlanningFile(bytes, path, 'planning.outline')
  const level = parsed.novel['level']
  if (level !== 'book' && level !== 'volume') invalidAsset(path, 'novel.level must be "book" or "volume"')
  validateOutlineParent(level, parsed.parentId, path)
  return {
    id: parsed.id,
    type: 'planning.outline',
    ...(parsed.parentId === undefined ? {} : { parentId: parsed.parentId }),
    title: parsed.title,
    frontmatter: parsed.file.frontmatter,
    content: { kind: 'outline', level, body: parsed.body },
    source: { bodyStartUtf16: parsed.file.bodyStartUtf16 } satisfies PlanningSource,
  }
}

/**
 * Parse one freeform Markdown chapter plan.
 *
 * @param bytes Serialized UTF-8 asset bytes.
 * @param path Project-relative path used in validation diagnostics.
 * @returns One validated chapter-outline asset.
 */
export function parseChapterOutline(bytes: Uint8Array, path: string): ParsedNovelAsset {
  const parsed = parsePlanningFile(bytes, path, 'planning.chapter-outline')
  if (parsed.parentId === undefined) invalidAsset(path, 'chapter outline requires novel.parent')
  return {
    id: parsed.id,
    type: 'planning.chapter-outline',
    parentId: parsed.parentId,
    title: parsed.title,
    frontmatter: parsed.file.frontmatter,
    content: { kind: 'chapter-outline', body: parsed.body },
    source: { bodyStartUtf16: parsed.file.bodyStartUtf16 } satisfies PlanningSource,
  }
}

/**
 * Parse the one freeform book brief allowed in a project.
 * @param bytes Serialized UTF-8 Asset bytes.
 * @param path Project-relative path used in validation diagnostics.
 * @returns One validated book-brief Asset.
 */
export function parseBookBrief(bytes: Uint8Array, path: string): ParsedNovelAsset {
  return parseBookGuidance(bytes, path, 'book.brief', 'book-brief')
}

/**
 * Parse the one freeform style profile allowed in a project.
 * @param bytes Serialized UTF-8 Asset bytes.
 * @param path Project-relative path used in validation diagnostics.
 * @returns One validated book-style-profile Asset.
 */
export function parseBookStyleProfile(bytes: Uint8Array, path: string): ParsedNovelAsset {
  return parseBookGuidance(bytes, path, 'book.style-profile', 'book-style-profile')
}

function parseBookGuidance(
  bytes: Uint8Array,
  path: string,
  type: 'book.brief' | 'book.style-profile',
  kind: 'book-brief' | 'book-style-profile',
): ParsedNovelAsset {
  const parsed = parsePlanningFile(bytes, path, type)
  if (parsed.parentId !== undefined) invalidAsset(path, `${type} must not declare novel.parent`)
  return {
    id: parsed.id,
    type,
    title: parsed.title,
    frontmatter: parsed.file.frontmatter,
    content: { kind, body: parsed.body },
    source: { bodyStartUtf16: parsed.file.bodyStartUtf16 } satisfies PlanningSource,
  }
}

function freeformBehavior(
  kind: 'outline' | 'chapter-outline' | 'book-brief' | 'book-style-profile',
  bodyOf: (content: unknown) => string,
  parse: (bytes: Uint8Array, path: string) => ParsedNovelAsset,
): Pick<NovelAssetTypeDefinition, 'serializeContent' | 'captureSelection' | 'modelText' | 'prepareOperations' | 'decodeOperations' | 'materializeOperations'> {
  return {
    serializeContent(snapshot, content, title) {
      const body = bodyOf(content)
      if (containsUnpairedSurrogate(body)) invalidAsset(snapshot.asset.projectRelativePath, 'freeform body contains an unpaired UTF-16 surrogate')
      const base = parse(snapshot.serializedUtf8, snapshot.asset.projectRelativePath)
      const source = planningSource(base)
      const before = new TextDecoder().decode(snapshot.serializedUtf8)
      const withBody = `${before.slice(0, source.bodyStartUtf16)}${body}`
      return retainedMaterialization(
        title === undefined ? withBody : replaceFrontmatterTitle(withBody, snapshot.asset.projectRelativePath, title),
        snapshot,
        parse,
      )
    },
    captureSelection(snapshot, input, options) {
      const body = bodyOf(snapshot.content)
      const range = textRangeInput(input)
      validateRange(body, range.startUtf16, range.endUtf16, 'selection')
      const quote = body.slice(range.startUtf16, range.endUtf16)
      return {
        selector: {
          kind: 'text-range',
          startUtf16: range.startUtf16,
          endUtf16: range.endUtf16,
          quoteHash: contentHash(new TextEncoder().encode(quote)),
          ...boundedBefore(body, range.startUtf16, options.contextUnits),
          ...boundedAfter(body, range.endUtf16, options.contextUnits),
        },
        preview: boundedSlice(quote, options.previewUnits),
      }
    },
    modelText(snapshot, selector) {
      const body = bodyOf(snapshot.content)
      if (selector === undefined) return body
      const range = textRangeSelector(selector)
      validateRange(body, range.startUtf16, range.endUtf16, 'selection')
      const selected = body.slice(range.startUtf16, range.endUtf16)
      if (contentHash(new TextEncoder().encode(selected)) !== range.quoteHash) invalidSelection()
      return selected
    },
    prepareOperations(snapshot, value) {
      if (!Array.isArray(value) || value.length !== 1) invalidChangeSet('operations must contain exactly one item')
      const operation: unknown = value[0]
      if (!isRecord(operation) || operation['kind'] !== 'replace-text'
        || !Number.isSafeInteger(operation['startUtf16']) || !Number.isSafeInteger(operation['endUtf16'])
        || typeof operation['replacement'] !== 'string') {
        invalidChangeSet('model operation is not a valid replace-text input')
      }
      const captured = this.captureSelection(snapshot, {
        kind: 'text-range',
        startUtf16: operation['startUtf16'] as number,
        endUtf16: operation['endUtf16'] as number,
      }, { contextUnits: 0, previewUnits: 1 })
      return [{
        kind: 'replace-text',
        selector: textRangeSelector(captured.selector),
        replacement: operation['replacement'],
      }]
    },
    decodeOperations(value) {
      return decodeOperations(value, kind)
    },
    materializeOperations(snapshot, operations) {
      const [operation] = decodeOperations(operations, kind)
      if (operation === undefined || operations.length !== 1) invalidChangeSet('operations must contain exactly one item')
      if (containsUnpairedSurrogate(operation.replacement)) invalidChangeSet('replacement contains an unpaired UTF-16 surrogate')
      const body = bodyOf(snapshot.content)
      const range = operation.selector
      validateRange(body, range.startUtf16, range.endUtf16, 'ChangeSet')
      if (contentHash(new TextEncoder().encode(body.slice(range.startUtf16, range.endUtf16))) !== range.quoteHash) {
        invalidChangeSet('replace-text quote hash does not match the retained Revision')
      }
      const nextBody = `${body.slice(0, range.startUtf16)}${operation.replacement}${body.slice(range.endUtf16)}`
      const next: NovelAssetContent = contentWithBody(kind, snapshot.content, nextBody)
      return this.serializeContent(snapshot, next)
    },
  }
}

function parsePlanningFile(
  bytes: Uint8Array,
  path: string,
  type: 'planning.outline' | 'planning.chapter-outline' | 'book.brief' | 'book.style-profile',
): {
  readonly file: ParsedFrontmatterFile
  readonly id: AssetId
  readonly title: string
  readonly parentId?: AssetId
  readonly novel: Readonly<Record<string, unknown>>
  readonly body: string
} {
  const file = parseFrontmatterFile(bytes, path)
  if (file.novel['type'] !== type) invalidAsset(path, `novel.type must be ${JSON.stringify(type)}`)
  const id = authoredString(file.novel['id'], 'novel.id', path, 240)
  const title = authoredString(file.novel['title'], 'novel.title', path, 240)
  const parent = file.novel['parent']
  if (parent !== undefined && (typeof parent !== 'string' || parent.trim().length === 0 || parent.trim() !== parent)) {
    invalidAsset(path, 'novel.parent must be a non-empty string without surrounding whitespace')
  }
  return {
    file,
    id: AssetId(id),
    title,
    ...(parent === undefined ? {} : { parentId: AssetId(parent) }),
    novel: file.novel,
    body: file.text.slice(file.bodyStartUtf16),
  }
}

function parseFrontmatterFile(bytes: Uint8Array, path: string): ParsedFrontmatterFile {
  if (bytes.includes(0)) invalidAsset(path, 'the file contains a NUL byte')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch (error: unknown) { invalidAsset(path, 'the file is not valid UTF-8', error) }
  const firstNewline = text.indexOf('\n')
  if (firstNewline < 0 || text.slice(0, firstNewline).replace(/\r$/u, '') !== '---') {
    invalidAsset(path, 'the file must start with YAML Frontmatter')
  }
  const closing = closingFrontmatter(text, firstNewline + 1)
  if (closing === undefined) invalidAsset(path, 'the YAML Frontmatter is not closed')
  const document = parseDocument(text.slice(firstNewline + 1, closing.start), { prettyErrors: true, uniqueKeys: true })
  const [error] = document.errors
  if (error !== undefined) invalidAsset(path, error.message, error)
  const [warning] = document.warnings
  if (warning !== undefined) invalidAsset(path, warning.message, warning)
  let value: unknown
  try { value = document.toJS({ maxAliasCount: 0 }) }
  catch (error: unknown) { invalidAsset(path, 'YAML aliases are not supported', error) }
  if (!isRecord(value) || containsControlDeep(value)) invalidAsset(path, 'Frontmatter must be a control-free mapping')
  const novel = value['novel']
  if (!isRecord(novel)) invalidAsset(path, 'novel must be a mapping')
  if (novel['schema'] !== 1) {
    if (typeof novel['schema'] === 'number' && Number.isSafeInteger(novel['schema'])) {
      throw new NovelRepositoryError(
        `novel repository: asset ${JSON.stringify(path)} uses unsupported schema ${novel['schema']}`,
        'NOVEL_PROJECT_SCHEMA_UNSUPPORTED',
      )
    }
    invalidAsset(path, 'novel.schema must be the integer 1')
  }
  return {
    text,
    frontmatter: value,
    novel,
    bodyStartUtf16: markdownBodyStart(text, closing.bodyStart),
  }
}

/** Treat one conventional blank separator after Frontmatter as file syntax, not authored prose. */
function markdownBodyStart(text: string, start: number): number {
  if (text.startsWith('\r\n', start)) return start + 2
  if (text.startsWith('\n', start)) return start + 1
  return start
}

function createdMaterialization(
  id: AssetId,
  title: string,
  type: 'planning.outline' | 'planning.chapter-outline' | 'book.brief' | 'book.style-profile',
  parentId: AssetId | undefined,
  extra: Readonly<Record<string, unknown>>,
  body: string,
  path: string,
  parse: (bytes: Uint8Array, path: string) => ParsedNovelAsset,
): NovelAssetMaterialization {
  const cleanTitle = authoredString(title, 'novel.title', path, 240)
  if (containsUnpairedSurrogate(body)) invalidAsset(path, 'freeform body contains an unpaired UTF-16 surrogate')
  const frontmatter = stringify({
    novel: {
      schema: 1,
      id,
      type,
      title: cleanTitle,
      ...extra,
      ...(parentId === undefined ? {} : { parent: parentId }),
    },
  }).trimEnd()
  const serializedUtf8 = new TextEncoder().encode(`---\n${frontmatter}\n---\n\n${body}`)
  return { serializedUtf8, parsed: parse(serializedUtf8, path) }
}

function retainedMaterialization(
  text: string,
  snapshot: AssetSnapshot,
  parse: (bytes: Uint8Array, path: string) => ParsedNovelAsset,
): NovelAssetMaterialization {
  const serializedUtf8 = new TextEncoder().encode(text)
  const parsed = parse(serializedUtf8, snapshot.asset.projectRelativePath)
  if (parsed.id !== snapshot.asset.id || parsed.parentId !== snapshot.asset.parentId) {
    invalidChangeSet('materialization changed the asset identity or parent')
  }
  return { serializedUtf8, parsed }
}

function replaceFrontmatterTitle(text: string, path: string, title: string): string {
  const clean = authoredString(title, 'novel.title', path, 240)
  const firstNewline = text.indexOf('\n')
  const closing = firstNewline < 0 ? undefined : closingFrontmatter(text, firstNewline + 1)
  if (firstNewline < 0 || closing === undefined) invalidAsset(path, 'the YAML Frontmatter is not closed')
  const yamlStart = firstNewline + 1
  const document = parseDocument(text.slice(yamlStart, closing.start), { prettyErrors: true, uniqueKeys: true })
  const node = document.getIn(['novel', 'title'], true)
  if (!isScalar(node) || node.range == null) invalidAsset(path, 'novel.title must be a scalar string')
  const [start, end] = node.range
  return `${text.slice(0, yamlStart + start)}${stringify(clean).trimEnd()}${text.slice(yamlStart + end)}`
}

function decodeOperations(value: unknown, owner: string): readonly ReplaceTextOperation[] {
  if (!Array.isArray(value) || value.length !== 1) invalidChangeSet('operations must contain exactly one item')
  const operation: unknown = value[0]
  if (!isRecord(operation) || operation['kind'] !== 'replace-text' || typeof operation['replacement'] !== 'string') {
    invalidChangeSet(`operation is not supported by ${owner}`)
  }
  return [{ kind: 'replace-text', selector: decodeTextRangeSelector(operation['selector']), replacement: operation['replacement'] }]
}

function outlineContent(value: unknown): PlanningOutlineContent {
  if (!isRecord(value) || value['kind'] !== 'outline' || (value['level'] !== 'book' && value['level'] !== 'volume')
    || typeof value['body'] !== 'string') invalidAsset('<asset-content>', 'outline content is invalid')
  return { kind: 'outline', level: value['level'], body: value['body'] }
}

function chapterContent(value: unknown): ChapterOutlineContent {
  if (!isRecord(value) || value['kind'] !== 'chapter-outline' || typeof value['body'] !== 'string') {
    invalidAsset('<asset-content>', 'chapter outline content is invalid')
  }
  return { kind: 'chapter-outline', body: value['body'] }
}

function bookBriefContent(value: unknown): BookBriefContent {
  if (!isRecord(value) || value['kind'] !== 'book-brief' || typeof value['body'] !== 'string') {
    invalidAsset('<asset-content>', 'book brief content is invalid')
  }
  return { kind: 'book-brief', body: value['body'] }
}

function bookStyleProfileContent(value: unknown): BookStyleProfileContent {
  if (!isRecord(value) || value['kind'] !== 'book-style-profile' || typeof value['body'] !== 'string') {
    invalidAsset('<asset-content>', 'book style profile content is invalid')
  }
  return { kind: 'book-style-profile', body: value['body'] }
}

function outlineBody(value: unknown): string { return outlineContent(value).body }
function chapterBody(value: unknown): string { return chapterContent(value).body }
function bookBriefBody(value: unknown): string { return bookBriefContent(value).body }
function bookStyleProfileBody(value: unknown): string { return bookStyleProfileContent(value).body }

function contentWithBody(
  kind: 'outline' | 'chapter-outline' | 'book-brief' | 'book-style-profile',
  current: unknown,
  body: string,
): NovelAssetContent {
  switch (kind) {
    case 'outline': return { ...outlineContent(current), body }
    case 'chapter-outline': return { kind, body }
    case 'book-brief': return { kind, body }
    case 'book-style-profile': return { kind, body }
  }
}

function freeformBookDefinition(config: {
  readonly type: 'book.brief' | 'book.style-profile'
  readonly kind: 'book-brief' | 'book-style-profile'
  readonly description: string
  readonly creationInstructions: string
  readonly parse: (bytes: Uint8Array, path: string) => ParsedNovelAsset
  readonly content: (value: unknown) => BookBriefContent | BookStyleProfileContent
}): NovelAssetTypeDefinition {
  const bodyOf = config.kind === 'book-brief' ? bookBriefBody : bookStyleProfileBody
  return {
    type: config.type,
    contentRoot: 'planning',
    extensions: ['.md'],
    projectSingleton: true,
    model: {
      description: config.description,
      creationInstructions: config.creationInstructions,
      proposalInstructions: 'Use one exact operation [{"kind":"replace-text","startUtf16":<integer>,"endUtf16":<integer>,"replacement":"..."}]. Offsets address the free Markdown body returned by novel_get. Modify only author-requested guidance; do not silently convert observations into durable project rules.',
    },
    parse: config.parse,
    create(request, path) {
      if (request.parentId !== undefined) invalidAsset(path, `${config.type} must not declare novel.parent`)
      const content = config.content(request.content)
      return createdMaterialization(
        request.id,
        request.title,
        config.type,
        undefined,
        {},
        content.body,
        path,
        config.parse,
      )
    },
    ...freeformBehavior(config.kind, bodyOf, config.parse),
  }
}

function validateOutlineParent(level: PlanningOutlineLevel, parentId: AssetId | undefined, path: string): void {
  if (level === 'book' && parentId !== undefined) invalidAsset(path, 'book outline must not declare novel.parent')
  if (level === 'volume' && parentId === undefined) invalidAsset(path, 'volume outline requires novel.parent')
}

function textRangeInput(input: NovelSelectionInput): TextRangeSelectionInput {
  if (!isRecord(input)
    || typeof input['startUtf16'] !== 'number' || typeof input['endUtf16'] !== 'number') invalidSelection()
  return { kind: 'text-range', startUtf16: input['startUtf16'], endUtf16: input['endUtf16'] }
}

function textRangeSelector(selector: NovelSelector): TextRangeSelector {
  try { return decodeTextRangeSelector(selector) } catch { return invalidSelection() }
}

function decodeTextRangeSelector(value: unknown): TextRangeSelector {
  if (!isRecord(value) || value['kind'] !== 'text-range'
    || !Number.isSafeInteger(value['startUtf16']) || !Number.isSafeInteger(value['endUtf16'])
    || typeof value['quoteHash'] !== 'string'
    || (value['prefix'] !== undefined && typeof value['prefix'] !== 'string')
    || (value['suffix'] !== undefined && typeof value['suffix'] !== 'string')) invalidChangeSet('replace-text selector is invalid')
  return {
    kind: 'text-range',
    startUtf16: value['startUtf16'] as number,
    endUtf16: value['endUtf16'] as number,
    quoteHash: value['quoteHash'] as ContentHash,
    ...(value['prefix'] === undefined ? {} : { prefix: value['prefix'] }),
    ...(value['suffix'] === undefined ? {} : { suffix: value['suffix'] }),
  }
}

function validateRange(body: string, start: number, end: number, owner: 'selection' | 'ChangeSet'): void {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > body.length
    || splitsSurrogatePair(body, start) || splitsSurrogatePair(body, end)) {
    if (owner === 'selection') invalidSelection()
    invalidChangeSet('replace-text selector is outside the retained body')
  }
}

function contentHash(bytes: Uint8Array): ContentHash {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function closingFrontmatter(text: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? text.length : newline
    if (text.slice(lineStart, lineEnd).replace(/\r$/u, '') === '---') {
      return { start: lineStart, bodyStart: newline < 0 ? text.length : newline + 1 }
    }
    if (newline < 0) return undefined
    lineStart = newline + 1
  }
}

function planningSource(parsed: ParsedNovelAsset): PlanningSource {
  if (!isRecord(parsed.source) || !Number.isSafeInteger(parsed.source['bodyStartUtf16'])) {
    invalidAsset('<retained-revision>', 'planning serialization state is invalid')
  }
  return { bodyStartUtf16: parsed.source['bodyStartUtf16'] as number }
}

function authoredString(value: unknown, field: string, path: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim() !== value || value.length > max
    || containsControl(value) || containsUnpairedSurrogate(value)) {
    invalidAsset(path, `${field} must be a non-empty string of at most ${max} UTF-16 units without surrounding whitespace or control characters`)
  }
  return value
}

function boundedBefore(text: string, offset: number, limit: number): Pick<TextRangeSelector, 'prefix'> {
  let start = Math.max(0, offset - limit)
  if (splitsSurrogatePair(text, start)) start += 1
  const prefix = text.slice(start, offset)
  return prefix === '' ? {} : { prefix }
}

function boundedAfter(text: string, offset: number, limit: number): Pick<TextRangeSelector, 'suffix'> {
  let end = Math.min(text.length, offset + limit)
  if (splitsSurrogatePair(text, end)) end -= 1
  const suffix = text.slice(offset, end)
  return suffix === '' ? {} : { suffix }
}

function boundedSlice(text: string, limit: number): string {
  if (text.length <= limit) return text
  const end = splitsSurrogatePair(text, limit) ? limit - 1 : limit
  return `${text.slice(0, end)}…`
}

function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false
  const before = text.charCodeAt(offset - 1)
  const after = text.charCodeAt(offset)
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF
}

function containsUnpairedSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(index + 1)
      if (next < 0xDC00 || next > 0xDFFF) return true
      index += 1
    } else if (code >= 0xDC00 && code <= 0xDFFF) return true
  }
  return false
}

function containsControl(value: string): boolean { return /[\u0000-\u001F\u007F]/u.test(value) }
function containsControlDeep(value: unknown): boolean {
  if (typeof value === 'string') return containsControl(value)
  if (Array.isArray(value)) return value.some(containsControlDeep)
  return isRecord(value) && Object.entries(value).some(([key, child]) => containsControl(key) || containsControlDeep(child))
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
function invalidSelection(): never {
  throw new NovelRepositoryError('novel repository: selection must be a non-empty UTF-16 range on code-point boundaries', 'NOVEL_SELECTION_INVALID')
}
function invalidChangeSet(detail: string): never {
  throw new NovelRepositoryError(`novel repository: invalid ChangeSet: ${detail}`, 'NOVEL_CHANGESET_INVALID')
}

/** Cordis plugin that registers freeform planning and project-guidance Asset definitions. */
export default { name, inject, apply }
