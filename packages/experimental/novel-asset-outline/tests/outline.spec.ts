import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  AssetId,
  ProjectId,
  RevisionId,
  type AssetSnapshot,
  type ContentHash,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import NovelAssetTypeRegistry from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'
import {
  apply,
  bookBriefTypeDefinition,
  bookStyleProfileTypeDefinition,
  chapterOutlineTypeDefinition,
  parseChapterOutline,
  parseBookBrief,
  parseOutline,
  planningOutlineTypeDefinition,
  type PlanningOutlineContent,
} from '../src/index.ts'

const BOOK_PATH = 'planning/main-outline.md'

function source(body = '# 故事总览\n\n主角在雨夜抵达白港。'): Uint8Array {
  return new TextEncoder().encode([
    '---',
    'novel:',
    '  schema: 1',
    '  id: outline-main',
    '  type: planning.outline',
    '  title: 全书大纲',
    '  level: book',
    'custom: retained',
    '---',
    '',
    body,
  ].join('\n'))
}

function snapshot(bytes = source()): AssetSnapshot {
  const parsed = parseOutline(bytes, BOOK_PATH)
  return {
    asset: {
      id: parsed.id,
      projectId: ProjectId('project-white-harbor'),
      type: parsed.type,
      projectRelativePath: BOOK_PATH,
    },
    revisionId: RevisionId('revision-outline-1'),
    serializedUtf8: bytes,
    contentHash: hash(bytes),
    frontmatter: parsed.frontmatter,
    content: parsed.content,
  }
}

function hash(bytes: Uint8Array): ContentHash {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

describe('freeform planning Host definitions', () => {
  it('registers book/volume outlines and chapter outlines for one plugin lifetime', async () => {
    const ctx = new Context()
    const registry = ctx.plugin(NovelAssetTypeRegistry)
    await registry
    const contribution = ctx.plugin({ inject: ['novelAssetTypes'], apply })
    await contribution
    expect(ctx.novelAssetTypes.get('planning.outline')).toBe(planningOutlineTypeDefinition)
    expect(ctx.novelAssetTypes.get('planning.chapter-outline')).toBe(chapterOutlineTypeDefinition)
    expect(ctx.novelAssetTypes.get('book.brief')).toBe(bookBriefTypeDefinition)
    expect(ctx.novelAssetTypes.get('book.style-profile')).toBe(bookStyleProfileTypeDefinition)
    await contribution.dispose()
    expect(() => ctx.novelAssetTypes.get('planning.outline')).toThrow(/no registered Host definition/u)
    expect(() => ctx.novelAssetTypes.get('planning.chapter-outline')).toThrow(/no registered Host definition/u)
    expect(() => ctx.novelAssetTypes.get('book.brief')).toThrow(/no registered Host definition/u)
    expect(() => ctx.novelAssetTypes.get('book.style-profile')).toThrow(/no registered Host definition/u)
    await registry.dispose()
  })

  it('retains arbitrary Markdown and freezes an exact text range', () => {
    const retained = snapshot()
    const content = retained.content as PlanningOutlineContent
    expect(content).toEqual({
      kind: 'outline',
      level: 'book',
      body: '# 故事总览\n\n主角在雨夜抵达白港。',
    })
    const startUtf16 = content.body.indexOf('雨夜')
    const captured = planningOutlineTypeDefinition.captureSelection(
      retained,
      { kind: 'text-range', startUtf16, endUtf16: startUtf16 + 2 },
      { contextUnits: 8, previewUnits: 160 },
    )
    expect(captured.preview).toBe('雨夜')
    expect(captured.selector).toMatchObject({ kind: 'text-range', startUtf16, endUtf16: startUtf16 + 2 })
    expect(planningOutlineTypeDefinition.modelText(retained, captured.selector)).toBe('雨夜')
    expect(planningOutlineTypeDefinition.modelText(retained)).toBe(content.body)
  })

  it('creates only book and volume hierarchy while leaving both bodies freeform', () => {
    const book = planningOutlineTypeDefinition.create({
      id: AssetId('outline-created'),
      title: '总纲',
      content: { kind: 'outline', level: 'book', body: '一句话、列表或整篇散文都可以。' },
    }, 'planning/outline-created.md')
    expect(book.parsed.parentId).toBeUndefined()
    expect(book.parsed.content).toEqual({ kind: 'outline', level: 'book', body: '一句话、列表或整篇散文都可以。' })

    const volume = planningOutlineTypeDefinition.create({
      id: AssetId('volume-created'),
      title: '第一卷卷纲',
      parentId: AssetId('outline-created'),
      content: { kind: 'outline', level: 'volume', body: '自由记录本卷推进。' },
    }, 'planning/volume-created.md')
    expect(volume.parsed.parentId).toBe('outline-created')
    expect(volume.parsed.content).toEqual({ kind: 'outline', level: 'volume', body: '自由记录本卷推进。' })

    expect(() => planningOutlineTypeDefinition.create({
      id: AssetId('bad-book'), title: '错误总纲', parentId: AssetId('outline-created'),
      content: { kind: 'outline', level: 'book', body: '' },
    }, 'planning/bad-book.md')).toThrow(/book outline must not/u)
    expect(() => planningOutlineTypeDefinition.create({
      id: AssetId('bad-volume'), title: '错误卷纲',
      content: { kind: 'outline', level: 'volume', body: '' },
    }, 'planning/bad-volume.md')).toThrow(/volume outline requires/u)
  })

  it('creates a freeform chapter outline only when bound to a manuscript chapter', () => {
    const created = chapterOutlineTypeDefinition.create({
      id: AssetId('chapter-outline-created'),
      title: '第一章章纲',
      parentId: AssetId('chapter-1'),
      content: { kind: 'chapter-outline', body: '# 本章想法\n\n只写清楚雨夜相遇这一件事。' },
    }, 'planning/chapter-outline-created.md')
    expect(created.parsed.parentId).toBe('chapter-1')
    expect(created.parsed.content).toEqual({
      kind: 'chapter-outline',
      body: '# 本章想法\n\n只写清楚雨夜相遇这一件事。',
    })
    expect(() => chapterOutlineTypeDefinition.create({
      id: AssetId('orphan'), title: '孤立章纲', content: { kind: 'chapter-outline', body: '' },
    }, 'planning/orphan.md')).toThrow(/requires novel.parent/u)
    expect(parseChapterOutline(created.serializedUtf8, 'planning/chapter-outline-created.md').parentId).toBe('chapter-1')
  })

  it('creates freeform project-singleton book brief and style Assets with exact proposal behavior', () => {
    expect(bookBriefTypeDefinition.projectSingleton).toBe(true)
    expect(bookStyleProfileTypeDefinition.projectSingleton).toBe(true)
    const created = bookBriefTypeDefinition.create!({
      id: AssetId('book-brief'),
      title: '本书概述',
      content: { kind: 'book-brief', body: '# 作品承诺\n\n都市悬疑连载。' },
    }, 'planning/book-brief.md')
    expect(parseBookBrief(created.serializedUtf8, 'planning/book-brief.md').content).toEqual({
      kind: 'book-brief',
      body: '# 作品承诺\n\n都市悬疑连载。',
    })
    const retained: AssetSnapshot = {
      asset: {
        id: created.parsed.id,
        projectId: ProjectId('project-white-harbor'),
        type: created.parsed.type,
        projectRelativePath: 'planning/book-brief.md',
      },
      revisionId: RevisionId('revision-book-brief-1'),
      serializedUtf8: created.serializedUtf8,
      contentHash: hash(created.serializedUtf8),
      frontmatter: created.parsed.frontmatter,
      content: created.parsed.content,
    }
    const startUtf16 = bookBriefTypeDefinition.modelText(retained).indexOf('都市')
    const operations = bookBriefTypeDefinition.prepareOperations(retained, [{
      kind: 'replace-text', startUtf16, endUtf16: startUtf16 + 2, replacement: '近未来',
    }])
    const materialized = bookBriefTypeDefinition.materializeOperations(retained, operations)
    expect(bookBriefTypeDefinition.modelText({ ...retained, content: materialized.parsed.content })).toContain('近未来悬疑连载')
    expect(() => bookStyleProfileTypeDefinition.create!({
      id: AssetId('book-style'),
      title: '本书风格',
      parentId: AssetId('outline-main'),
      content: { kind: 'book-style-profile', body: '克制、具体。' },
    }, 'planning/book-style.md')).toThrow(/must not declare novel.parent/u)
  })

  it('materializes one exact replacement and preserves unrelated Frontmatter', () => {
    const retained = snapshot()
    const content = retained.content as PlanningOutlineContent
    const startUtf16 = content.body.indexOf('雨夜')
    const operations = planningOutlineTypeDefinition.prepareOperations(retained, [{
      kind: 'replace-text', startUtf16, endUtf16: startUtf16 + 2, replacement: '暴雨之夜',
    }])
    const materialized = planningOutlineTypeDefinition.materializeOperations(retained, operations)
    const text = new TextDecoder().decode(materialized.serializedUtf8)
    expect(text).toContain('custom: retained')
    expect(text).toContain('主角在暴雨之夜抵达白港。')

    const stale = structuredClone(operations) as unknown as Array<{ selector: { quoteHash: string } }>
    stale[0]!.selector.quoteHash = `sha256:${'0'.repeat(64)}`
    expect(() => planningOutlineTypeDefinition.materializeOperations(retained, stale as never)).toThrow(/quote hash/u)
  })
})
