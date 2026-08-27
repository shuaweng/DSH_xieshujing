import { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import {
  AssetId,
  ChangeSetId,
  ProjectId,
  RevisionId,
  type AssetSnapshot,
  type ChangeSet,
  type ContentHash,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import LocalNovelRepository from '../src/index.ts'
import NovelAssetTypeRegistry, {
  type NovelAssetTypeDefinition,
  type ParsedNovelAsset,
} from '../../novel-repository/src/asset-types.ts'
import { installApplyFault, type ApplyFaultStage } from '../src/apply-fault.ts'
import {
  containsUnpairedSurrogate,
  manuscriptChapterTypeDefinition,
  parseChapter,
  splitsSurrogatePair,
} from '../src/content.ts'
import { NOVEL_HISTORY_APPLICATION_ID, openHistory } from '../src/history.ts'
import { parseProjectManifest } from '../src/manifest.ts'

const cleanups: Array<() => Promise<void>> = []
const decodeHistoryOperations = (assetType: string, value: unknown) => {
  if (assetType !== manuscriptChapterTypeDefinition.type) throw new Error(`unsupported test Asset type ${assetType}`)
  return manuscriptChapterTypeDefinition.decodeOperations(value)
}

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-novel-repository-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function boot(
  dir: string,
  config: ConstructorParameters<typeof LocalNovelRepository>[1] = {},
  definitions: readonly NovelAssetTypeDefinition[] = [],
): Promise<Context> {
  const ctx = new Context()
  const fsFiber = ctx.plugin(LocalFileSystem, { cwd: dir })
  await fsFiber
  const typesFiber = ctx.plugin(NovelAssetTypeRegistry)
  await typesFiber
  for (const definition of definitions) ctx.novelAssetTypes.register(definition)
  const repositoryFiber = ctx.plugin(LocalNovelRepository, config)
  await repositoryFiber
  cleanups.push(async () => { await fsFiber.dispose() })
  cleanups.push(async () => { await typesFiber.dispose() })
  cleanups.push(async () => { await repositoryFiber.dispose() })
  return ctx
}

function parseTestNote(serializedUtf8: Uint8Array): ParsedNovelAsset {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(serializedUtf8)
  const id = /^\s+id: ([^\n]+)$/mu.exec(text)?.[1]
  const title = /^\s+title: ([^\n]+)$/mu.exec(text)?.[1]
  const body = text.split('---\n').at(-1)
  if (id === undefined || title === undefined || body === undefined) throw new Error('invalid test note')
  return {
    id: AssetId(id),
    type: 'bible.test' as never,
    title,
    frontmatter: { novel: { schema: 1, id, type: 'bible.test', title } },
    content: { kind: 'test-note', text: body } as never,
    source: undefined,
  }
}

const testNoteType = {
  type: 'bible.test',
  contentRoot: 'notes',
  extensions: ['.note'],
  model: { description: 'test note', creationInstructions: 'create test note', proposalInstructions: 'test only' },
  parse: parseTestNote,
  create(request: { id: string; title: string; content: unknown }) {
    const content = request.content as { text: string }
    const serializedUtf8 = new TextEncoder().encode([
      '---', 'novel:', '  schema: 1', `  id: ${request.id}`, '  type: bible.test',
      `  title: ${request.title}`, '---', content.text,
    ].join('\n'))
    return { serializedUtf8, parsed: parseTestNote(serializedUtf8) }
  },
  serializeContent: () => { throw new Error('unused') },
  captureSelection: () => { throw new Error('unused') },
  modelText(snapshot: AssetSnapshot) { return (snapshot.content as never as { text: string }).text },
  prepareOperations: () => [],
  decodeOperations: () => [],
  materializeOperations: () => { throw new Error('unused') },
} as never as NovelAssetTypeDefinition

const singletonTestNoteType: NovelAssetTypeDefinition = {
  ...testNoteType,
  projectSingleton: true,
}

function parseTestStoryState(serializedUtf8: Uint8Array): ParsedNovelAsset {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(serializedUtf8)
  const id = /^\s+id: ([^\n]+)$/mu.exec(text)?.[1]
  const title = /^\s+title: ([^\n]+)$/mu.exec(text)?.[1]
  const body = text.split('---\n').at(-1)
  if (id === undefined || title === undefined || body === undefined) throw new Error('invalid test Story State')
  return {
    id: AssetId(id), type: 'book.story-state', title,
    frontmatter: { novel: { schema: 1, id, type: 'book.story-state', title } },
    content: { kind: 'book-story-state', body } as never,
    source: undefined,
  }
}

const storyStateTestType: NovelAssetTypeDefinition = {
  ...testNoteType,
  type: 'book.story-state',
  contentRoot: 'planning',
  extensions: ['.md'],
  projectSingleton: true,
  parse: parseTestStoryState,
  modelText(snapshot: AssetSnapshot) { return (snapshot.content as never as { body: string }).body },
}

function chapter(id: string, title: string, body: string, newline = '\n'): string {
  return [
    '---',
    'novel:',
    '  schema: 1',
    `  id: ${id}`,
    '  type: manuscript.chapter',
    `  title: ${title}`,
    '---',
    body,
  ].join(newline)
}

async function project(ctx: Context): Promise<NonNullable<Awaited<ReturnType<Context['novelRepository']['discoverProject']>>>> {
  const value = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
  if (value === undefined) throw new Error('expected Novel Project')
  return value
}

function manifest(overrides: string[] = []): string {
  return [
    'kind: novel-project',
    'schema: 1',
    'id: project-white-harbor',
    'title: White Harbor',
    'contentRoots:',
    '  manuscript: manuscript',
    ...overrides,
    '',
  ].join('\n')
}

describe('LocalNovelRepository', () => {
  it('initializes an existing folder as a minimal Novel Project without disturbing authored files', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'notes.txt'), '作者原有资料。')
    const ctx = await boot(dir)
    const root = await ctx.fs.resolve('.')

    await expect(ctx.novelRepository.discoverProject(root)).resolves.toBeUndefined()
    const initialized = await ctx.novelRepository.initializeProject(root, { title: '  国运擂台  ' })

    expect(initialized).toMatchObject({ schema: 1, title: '国运擂台' })
    expect(initialized.id).toMatch(/^project-/u)
    expect(await readFile(join(dir, 'notes.txt'), 'utf8')).toBe('作者原有资料。')
    expect(await readdir(join(dir, 'manuscript'))).toContain('.gitkeep')
    expect(await readdir(join(dir, 'planning'))).toContain('.gitkeep')
    expect(parseProjectManifest(await readFile(join(dir, 'novel.yaml'), 'utf8'), 'novel.yaml'))
      .toMatchObject({ title: '国运擂台', contentRoots: { manuscript: 'manuscript', planning: 'planning' } })
    await expect(ctx.novelRepository.discoverProject(root)).resolves.toMatchObject({ id: initialized.id })
    await expect(ctx.novelRepository.initializeProject(root, { title: '另一本书' }))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_ALREADY_INITIALIZED' })
  })

  it('rejects invalid initialization before publishing a manifest', async () => {
    const dir = await tempDir()
    const ctx = await boot(dir)
    const root = await ctx.fs.resolve('.')
    await expect(ctx.novelRepository.initializeProject(root, { title: '   ' }))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_INITIALIZATION_INVALID' })
    await expect(readFile(join(dir, 'novel.yaml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    await writeFile(join(dir, 'manuscript'), '这不是目录')
    await expect(ctx.novelRepository.initializeProject(root, { title: '冲突测试' }))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_CONTENT_ROOT_CONFLICT' })
    await expect(readFile(join(dir, 'novel.yaml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('enforces registered project-singleton Asset types for creation and authored scans', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(dir, 'notes'))
    await writeFile(join(dir, 'novel.yaml'), manifest(['  notes: notes']))
    const ctx = await boot(dir, {}, [singletonTestNoteType])
    const novel = await project(ctx)
    await ctx.novelRepository.createAsset(novel, {
      type: 'bible.test' as never,
      title: '唯一资料',
      content: { kind: 'test-note', text: '第一份。' } as never,
      actor: { kind: 'user', sessionId: SessionId('session-user') },
    })
    await expect(ctx.novelRepository.createAsset(novel, {
      type: 'bible.test' as never,
      title: '重复资料',
      content: { kind: 'test-note', text: '第二份。' } as never,
      actor: { kind: 'user', sessionId: SessionId('session-user') },
    })).rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })

    await writeFile(join(dir, 'notes', 'duplicate.note'), [
      '---', 'novel:', '  schema: 1', '  id: duplicate-note', '  type: bible.test',
      '  title: 外部重复', '---', '外部写入。',
    ].join('\n'))
    await expect(ctx.novelRepository.listAssets(novel))
      .rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })
  })

  it('creates a registered typed Asset at a repository-owned path and retains its first Revision', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(dir, 'notes'))
    await writeFile(join(dir, 'novel.yaml'), manifest(['  notes: notes']))
    const ctx = await boot(dir, {}, [testNoteType])
    const novel = await project(ctx)

    const created = await ctx.novelRepository.createAsset(novel, {
      type: 'bible.test' as never,
      title: '雾港设定',
      content: { kind: 'test-note', text: '雾覆盖整个港口。' } as never,
      actor: { kind: 'user', sessionId: SessionId('session-user') },
    })
    expect(created.asset.type).toBe('bible.test')
    expect(created.asset.projectRelativePath).toMatch(/^notes\/asset_.+\.note$/u)
    expect(created.content).toEqual({ kind: 'test-note', text: '雾覆盖整个港口。' })
    expect(await readFile(join(dir, created.asset.projectRelativePath), 'utf8')).toContain('title: 雾港设定')
    const listed = await ctx.novelRepository.listAssets(novel)
    expect(listed.some(item => item.asset.id === created.asset.id)).toBe(true)
  })

  it('creates a complete manuscript chapter through the built-in Asset definition', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const ctx = await boot(dir)
    const novel = await project(ctx)

    const created = await ctx.novelRepository.createAsset(novel, {
      type: 'manuscript.chapter',
      title: '第一章 华夏无神',
      content: { kind: 'manuscript', body: '哪吒踏火而来。\n' },
      actor: { kind: 'agent', sessionId: SessionId('session-agent') },
    })

    expect(created.asset.projectRelativePath).toMatch(/^manuscript\/asset_.+\.md$/u)
    expect(created.content).toEqual({ kind: 'manuscript', body: '哪吒踏火而来。\n' })
    expect(await readFile(join(dir, created.asset.projectRelativePath), 'utf8')).toContain('哪吒踏火而来。')
    await expect(ctx.novelRepository.createAsset(novel, {
      type: 'manuscript.chapter',
      title: '错误父级',
      parentId: created.asset.id,
      content: { kind: 'manuscript', body: '' },
      actor: { kind: 'agent', sessionId: SessionId('session-agent') },
    })).rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })
  })

  it('persists chapter order in the project manifest without creating chapter Revisions', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const first = await ctx.novelRepository.createAsset(novel, {
      type: 'manuscript.chapter', title: '第一章', content: { kind: 'manuscript', body: '一。' },
      actor: { kind: 'user', sessionId: SessionId('session-user') },
    })
    const second = await ctx.novelRepository.createAsset(novel, {
      type: 'manuscript.chapter', title: '第二章', content: { kind: 'manuscript', body: '二。' },
      actor: { kind: 'user', sessionId: SessionId('session-user') },
    })

    const reordered = await ctx.novelRepository.reorderAssets(novel, {
      type: 'manuscript.chapter', orderedAssetIds: [second.asset.id, first.asset.id],
    })
    expect(reordered.map(item => item.asset.id)).toEqual([second.asset.id, first.asset.id])
    expect((await ctx.novelRepository.listAssets(novel)).map(item => item.asset.id))
      .toEqual([second.asset.id, first.asset.id])
    expect(await ctx.novelRepository.listAssetRevisions(novel, first.asset.id)).toHaveLength(1)
    expect(await ctx.novelRepository.listAssetRevisions(novel, second.asset.id)).toHaveLength(1)
    const rediscovered = await project(ctx)
    expect((await ctx.novelRepository.listAssets(rediscovered)).map(item => item.asset.id))
      .toEqual([second.asset.id, first.asset.id])
    expect(parseProjectManifest(await readFile(join(dir, 'novel.yaml'), 'utf8'), 'novel.yaml').assetOrder)
      .toEqual({ 'manuscript.chapter': [second.asset.id, first.asset.id] })

    await expect(ctx.novelRepository.reorderAssets(rediscovered, {
      type: 'manuscript.chapter', orderedAssetIds: [first.asset.id],
    })).rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })
  })

  it('discovers a second registered Asset type without repository type branches', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(dir, 'notes'))
    await writeFile(join(dir, 'novel.yaml'), manifest(['  notes: notes']))
    await writeFile(join(dir, 'notes', 'setting.note'), [
      '---',
      'novel:',
      '  schema: 1',
      '  id: note-white-harbor',
      '  type: bible.test',
      '  title: White Harbor setting',
      '---',
      'Fog covers the harbor.',
    ].join('\n'))
    const ctx = await boot(dir, {}, [testNoteType])
    const currentProject = await project(ctx)

    const assets = await ctx.novelRepository.listAssets(currentProject)
    expect(assets).toHaveLength(1)
    expect(assets[0]?.asset).toMatchObject({
      id: 'note-white-harbor',
      type: 'bible.test',
      projectRelativePath: 'notes/setting.note',
    })
    const snapshot = await ctx.novelRepository.readAsset(currentProject, AssetId('note-white-harbor'))
    expect(snapshot.content).toEqual({ kind: 'test-note', text: 'Fog covers the harbor.' })
  })

  it('searches titles and typed model text with deterministic exact Revision results', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(dir, 'notes'))
    await writeFile(join(dir, 'novel.yaml'), manifest(['  notes: notes']))
    await writeFile(join(dir, 'manuscript', 'chapter.md'), chapter('chapter-search', '抵达', '林澈第一次看见白港。'))
    await writeFile(join(dir, 'notes', 'setting.note'), [
      '---', 'novel:', '  schema: 1', '  id: note-search', '  type: bible.test',
      '  title: 白港', '---', 'Fog covers the harbor.',
    ].join('\n'))
    const ctx = await boot(dir, {}, [testNoteType])
    const novel = await project(ctx)

    const matches = await ctx.novelRepository.searchAssets(novel, { query: '白港' })
    expect(matches.map(match => ({ id: match.summary.asset.id, excerpt: match.excerpt })))
      .toEqual([
        { id: 'note-search', excerpt: 'Fog covers the harbor.' },
        { id: 'chapter-search', excerpt: '林澈第一次看见白港。' },
      ])
    expect(matches[0]?.score).toBe(1_000)
    expect(typeof matches[1]?.score).toBe('number')
    expect(matches[0]?.summary.revisionId).toMatch(/^revision_/u)
    await expect(ctx.novelRepository.searchAssets(novel, {
      query: 'harbor', types: ['bible.test' as never], limit: 1,
    })).resolves.toMatchObject([{ summary: { asset: { id: 'note-search', type: 'bible.test' } } }])
    await expect(ctx.novelRepository.searchAssets(novel, { query: '   ' }))
      .rejects.toMatchObject({ code: 'NOVEL_SEARCH_INVALID' })
    await expect(ctx.novelRepository.searchAssets(novel, { query: '白港', limit: 51 }))
      .rejects.toMatchObject({ code: 'NOVEL_SEARCH_INVALID' })
  })

  it('discovers one project and resolves every declared content root through ctx.fs', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(dir, 'notes'))
    await writeFile(join(dir, 'novel.yaml'), manifest(['  research: notes']))
    const beforeManifest = await readFile(join(dir, 'novel.yaml'))
    const beforeEntries = await readdir(dir)
    const ctx = await boot(dir)
    const root = await ctx.fs.resolve('.')
    const manuscript = await ctx.fs.resolve('manuscript')
    const research = await ctx.fs.resolve('notes')

    await expect(ctx.novelRepository.discoverProject(root)).resolves.toMatchObject({
      schema: 1,
      id: 'project-white-harbor',
      title: 'White Harbor',
      root: { targetKey: root.targetKey },
      contentRoots: {
        manuscript: { targetKey: manuscript.targetKey },
        research: { targetKey: research.targetKey },
      },
    })
    expect(await readFile(join(dir, 'novel.yaml'))).toEqual(beforeManifest)
    expect(await readdir(dir)).toEqual(beforeEntries)
    expect(beforeEntries).not.toContain('.novel')
  })

  it('returns undefined only when the project marker is absent', async () => {
    const dir = await tempDir()
    const ctx = await boot(dir)
    await expect(ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))).resolves.toBeUndefined()
  })

  it('rejects a missing or non-directory project root', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'file.txt'), 'not a directory')
    const ctx = await boot(dir)
    for (const path of ['missing', 'file.txt']) {
      await expect(ctx.novelRepository.discoverProject(await ctx.fs.resolve(path)))
        .rejects.toMatchObject({ code: 'NOVEL_PROJECT_ROOT_INVALID' })
    }
  })

  it('rejects a marker directory and markers above the configured byte bound', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'novel.yaml'))
    const ctx = await boot(dir, { manifestMaxBytes: 8 })
    const root = await ctx.fs.resolve('.')
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' })

    await rm(join(dir, 'novel.yaml'), { recursive: true })
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_TOO_LARGE' })
  })

  it('accepts a manifest exactly at the configured byte bound', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    const text = manifest().replace('title: White Harbor', 'title: 白港')
    await writeFile(join(dir, 'novel.yaml'), text)
    const exact = await boot(dir, { manifestMaxBytes: Buffer.byteLength(text) })
    await expect(exact.novelRepository.discoverProject(await exact.fs.resolve('.')))
      .resolves.toMatchObject({ id: 'project-white-harbor' })

    const tooSmall = await boot(dir, { manifestMaxBytes: Buffer.byteLength(text) - 1 })
    await expect(tooSmall.novelRepository.discoverProject(await tooSmall.fs.resolve('.')))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_TOO_LARGE' })
  })

  it('rejects NUL bytes and invalid UTF-8 before YAML parsing', async () => {
    const dir = await tempDir()
    const ctx = await boot(dir)
    const root = await ctx.fs.resolve('.')

    await writeFile(join(dir, 'novel.yaml'), Buffer.from('kind:\0 novel-project'))
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' })

    await writeFile(join(dir, 'novel.yaml'), Buffer.from([0xff]))
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' })
  })

  it.skipIf(process.platform === 'win32')('rejects a marker symlink and a content-root symlink that escape the project', async () => {
    const dir = await tempDir()
    const outside = await tempDir()
    await symlink(join(outside, 'missing.yaml'), join(dir, 'novel.yaml'))
    const ctx = await boot(dir)
    const root = await ctx.fs.resolve('.')
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' })

    await rm(join(dir, 'novel.yaml'))
    await writeFile(join(outside, 'novel.yaml'), manifest())
    await symlink(join(outside, 'novel.yaml'), join(dir, 'novel.yaml'))
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_PATH_ESCAPE' })

    await rm(join(dir, 'novel.yaml'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await symlink(outside, join(dir, 'manuscript'))
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_PATH_ESCAPE' })
  })

  it.skipIf(process.platform === 'win32')('rejects a dangling content-root symlink before its outside target appears', async () => {
    const dir = await tempDir()
    const outside = await tempDir()
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await symlink(join(outside, 'later'), join(dir, 'manuscript'))
    const ctx = await boot(dir)

    await expect(ctx.novelRepository.discoverProject(await ctx.fs.resolve('.')))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' })
  })

  it('requires every declared content root to exist as a directory', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const ctx = await boot(dir)
    const root = await ctx.fs.resolve('.')
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' })

    await writeFile(join(dir, 'manuscript'), 'not a directory')
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' })
  })

  it('rejects a declared parent traversal and passes through caller cancellation', async () => {
    const dir = await tempDir()
    const ctx = await boot(dir)
    const root = await ctx.fs.resolve('.')
    await writeFile(
      join(dir, 'novel.yaml'),
      manifest().replace('manuscript: manuscript', 'manuscript: ../outside'),
    )
    await expect(ctx.novelRepository.discoverProject(root))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_PATH_ESCAPE' })

    await writeFile(join(dir, 'novel.yaml'), manifest())
    const controller = new AbortController()
    controller.abort()
    await expect(ctx.novelRepository.discoverProject(root, controller.signal))
      .rejects.toMatchObject({ code: 'FS_ABORTED' })
  })

  it('passes through unrelated filesystem failures and rejects invalid provider config', async () => {
    const dir = await tempDir()
    const ctx = await boot(dir)
    const root = await ctx.fs.resolve('.')
    const original = ctx.fs.readBytes.bind(ctx.fs)
    ctx.fs.readBytes = () => Promise.reject(new Error('storage offline'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await expect(ctx.novelRepository.discoverProject(root)).rejects.toThrow('storage offline')
    ctx.fs.readBytes = original

    const direct = new Context()
    new NovelAssetTypeRegistry(direct)
    const defaultRepository = new LocalNovelRepository(direct)
    expect(defaultRepository.manifestMaxBytes).toBe(64 * 1024)
    await direct.fiber.dispose()

    for (const manifestMaxBytes of [0, 1.5, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]) {
      const invalid = new Context()
      const fsFiber = invalid.plugin(LocalFileSystem, { cwd: dir })
      await fsFiber
      await invalid.plugin(NovelAssetTypeRegistry)
      await expect(invalid.plugin(LocalNovelRepository, { manifestMaxBytes }))
        .rejects.toThrow(/integer between 1 and/)
      await fsFiber.dispose()
    }
  })

  it('releases only the repository service when its provider fiber is disposed', async () => {
    const dir = await tempDir()
    const ctx = new Context()
    const fsFiber = ctx.plugin(LocalFileSystem, { cwd: dir })
    await fsFiber
    const repositoryFiber = ctx.plugin(LocalNovelRepository)
    await repositoryFiber

    await repositoryFiber.dispose()
    expect(ctx.get('novelRepository')).toBeUndefined()
    expect(ctx.get('fs')).toBeDefined()
    await fsFiber.dispose()
  })

  it('catalogs exact chapter bytes, retains identity across rename, and creates no sidecar metadata', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const exact = chapter('chapter-one', '第一章', '白港\r\n下雨了。', '\r\n')
    await writeFile(join(dir, 'manuscript', 'chapter-one.md'), exact)
    const ctx = await boot(dir)
    const novel = await project(ctx)

    const [first] = await ctx.novelRepository.listAssets(novel)
    expect(first).toMatchObject({
      asset: {
        id: 'chapter-one',
        type: 'manuscript.chapter',
        projectRelativePath: 'manuscript/chapter-one.md',
      },
      title: '第一章',
    })
    const snapshot = await ctx.novelRepository.readAsset(novel, first!.asset.id)
    expect(Buffer.from(snapshot.serializedUtf8).toString('utf8')).toBe(exact)
    expect(snapshot.content).toEqual({ kind: 'manuscript', body: '白港\r\n下雨了。' })
    expect(snapshot.contentHash).toBe(`sha256:${createHash('sha256').update(exact).digest('hex')}`)

    await rename(
      join(dir, 'manuscript', 'chapter-one.md'),
      join(dir, 'manuscript', 'renamed.md'),
    )
    const [renamed] = await ctx.novelRepository.listAssets(novel)
    expect(renamed!.asset.id).toBe(first!.asset.id)
    expect(renamed!.revisionId).toBe(first!.revisionId)
    expect(renamed!.asset.projectRelativePath).toBe('manuscript/renamed.md')
    expect(await readdir(join(dir, 'manuscript'))).toEqual(['renamed.md'])
  })

  it('retains exact external edits as new immutable Revisions while old bytes remain readable', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const path = join(dir, 'manuscript', 'chapter.md')
    const before = chapter('chapter-one', '第一章', '旧正文')
    const after = chapter('chapter-one', '第一章', '外部编辑后的正文')
    await writeFile(path, before)
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [initial] = await ctx.novelRepository.listAssets(novel)

    await writeFile(path, after)
    const [current] = await ctx.novelRepository.listAssets(novel)
    expect(current!.revisionId).not.toBe(initial!.revisionId)
    expect((await ctx.novelRepository.readAsset(novel, current!.asset.id)).content)
      .toEqual({ kind: 'manuscript', body: '外部编辑后的正文' })
    const retained = await ctx.novelRepository.readAsset(novel, initial!.asset.id, initial!.revisionId)
    expect(Buffer.from(retained.serializedUtf8).toString('utf8')).toBe(before)
  })

  it('lists immutable Revisions and upserts one generated report kind per exact Revision', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'chapter.md'), chapter('chapter-one', '第一章', '初稿'))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [initial] = await ctx.novelRepository.listAssets(novel)
    const unchanged = await ctx.novelRepository.saveAssetContent(novel, {
      assetId: initial!.asset.id,
      baseRevisionId: initial!.revisionId,
      title: '第一章',
      content: { kind: 'manuscript', body: '初稿' },
    })
    expect(unchanged.revisionId).toBe(initial!.revisionId)
    expect(await ctx.novelRepository.listAssetRevisions(novel, initial!.asset.id)).toHaveLength(1)

    const saved = await ctx.novelRepository.saveAssetContent(novel, {
      assetId: initial!.asset.id,
      baseRevisionId: initial!.revisionId,
      content: { kind: 'manuscript', body: '第二稿' },
    })

    await expect(ctx.novelRepository.listAssetRevisions(novel, initial!.asset.id))
      .resolves.toMatchObject([
        { id: saved.revisionId, parentRevisionId: initial!.revisionId, origin: 'user-edit' },
        { id: initial!.revisionId, origin: 'initial-scan' },
      ])
    expect((await ctx.novelRepository.listAssetRevisions(novel, initial!.asset.id))
      .every(revision => !('serializedUtf8' in revision))).toBe(true)
    await ctx.novelRepository.putAnalysisReport(novel, {
      assetId: initial!.asset.id,
      revisionId: initial!.revisionId,
      kind: 'noai-scan',
      analyzerVersion: 'rules/1',
      generatedAt: '2026-08-25T01:00:00.000Z',
      data: { riskScore: 45 },
      sourceSessionId: SessionId('session-one'),
    })
    await ctx.novelRepository.putAnalysisReport(novel, {
      assetId: initial!.asset.id,
      revisionId: initial!.revisionId,
      kind: 'noai-scan',
      analyzerVersion: 'rules/2',
      generatedAt: '2026-08-25T02:00:00.000Z',
      data: { riskScore: 20 },
      sourceSessionId: SessionId('session-two'),
    })
    await expect(ctx.novelRepository.listAnalysisReports(novel, initial!.asset.id, initial!.revisionId))
      .resolves.toEqual([expect.objectContaining({
        kind: 'noai-scan', analyzerVersion: 'rules/2', data: { riskScore: 20 },
        sourceSessionId: 'session-two',
      })])
    await expect(ctx.novelRepository.listAnalysisReports(novel, initial!.asset.id, saved.revisionId))
      .resolves.toEqual([])
    await expect(ctx.novelRepository.putAnalysisReport(novel, {
      assetId: AssetId('other-asset'),
      revisionId: initial!.revisionId,
      kind: 'chapter-review',
      analyzerVersion: 'review/1',
      generatedAt: '2026-08-25T03:00:00.000Z',
      data: {},
    })).rejects.toMatchObject({ code: 'NOVEL_REVISION_NOT_FOUND' })
  })

  it('restores historical bytes as a new head while preserving reports and conflicting pending proposals', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(dir, 'planning'))
    await writeFile(join(dir, 'novel.yaml'), manifest(['  planning: planning']))
    const initialBytes = chapter('chapter-one', '第一章', '初稿正文')
    await writeFile(join(dir, 'manuscript', 'chapter.md'), initialBytes)
    await writeFile(join(dir, 'planning', 'story-state.md'), [
      '---', 'novel:', '  schema: 1', '  id: story-state-one',
      '  type: book.story-state', '  title: 故事状态', '---', '# 当前事实', '',
    ].join('\n'))
    const ctx = await boot(dir, {}, [storyStateTestType])
    const novel = await project(ctx)
    const assets = await ctx.novelRepository.listAssets(novel)
    const initial = assets.find(value => value.asset.id === 'chapter-one')!
    const saved = await ctx.novelRepository.saveAssetContent(novel, {
      assetId: initial.asset.id,
      baseRevisionId: initial.revisionId,
      title: '第一章 · 修订稿',
      content: { kind: 'manuscript', body: '修订后的正文' },
    })
    await ctx.novelRepository.putAnalysisReport(novel, {
      assetId: initial.asset.id,
      revisionId: saved.revisionId,
      kind: 'chapter-review',
      analyzerVersion: 'review/restore-test',
      generatedAt: '2026-08-27T01:00:00.000Z',
      data: { overallScore: 88 },
    })
    const selection = await ctx.novelRepository.captureSelection(novel, {
      assetId: initial.asset.id,
      revisionId: saved.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    })
    const pending = await ctx.novelRepository.proposeChangeSet(novel, {
      assetId: initial.asset.id,
      baseRevisionId: saved.revisionId,
      operations: [{ kind: 'replace-text', selector: selection.selector, replacement: '再' }],
      actor: { kind: 'agent', sessionId: SessionId('session-agent') },
      summary: '尚未接受的提案',
    })

    await expect(ctx.novelRepository.restoreAssetRevision(novel, {
      assetId: initial.asset.id,
      baseRevisionId: saved.revisionId,
      sourceRevisionId: initial.revisionId,
      restoredBySessionId: SessionId(' '),
    })).rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })
    await expect(ctx.novelRepository.readAsset(novel, initial.asset.id))
      .resolves.toMatchObject({ revisionId: saved.revisionId, content: { body: '修订后的正文' } })

    const restored = await ctx.novelRepository.restoreAssetRevision(novel, {
      assetId: initial.asset.id,
      baseRevisionId: saved.revisionId,
      sourceRevisionId: initial.revisionId,
      restoredBySessionId: SessionId('session-author'),
    })

    expect(restored).toMatchObject({
      snapshot: {
        frontmatter: { novel: { title: '第一章' } },
        content: { kind: 'manuscript', body: '初稿正文' },
      },
      conflictedChangeSetCount: 1,
      storyStateReviewRecommended: true,
    })
    expect(restored.snapshot.revisionId).toMatch(/^revision_/u)
    expect(restored.snapshot.revisionId).not.toBe(initial.revisionId)
    expect(await readFile(join(dir, 'manuscript', 'chapter.md'), 'utf8')).toBe(initialBytes)
    await expect(ctx.novelRepository.readChangeSet(novel, pending.id))
      .resolves.toMatchObject({ status: 'conflicted' })
    await expect(ctx.novelRepository.listAnalysisReports(novel, initial.asset.id, saved.revisionId))
      .resolves.toEqual([expect.objectContaining({ analyzerVersion: 'review/restore-test' })])
    const revisions = await ctx.novelRepository.listAssetRevisions(novel, initial.asset.id)
    expect(revisions).toHaveLength(3)
    expect(revisions[0]).toMatchObject({
      id: restored.snapshot.revisionId,
      parentRevisionId: saved.revisionId,
      origin: 'user-edit',
      restoredFromRevisionId: initial.revisionId,
      restoredBySessionId: 'session-author',
    })
    expect(revisions.map(value => value.id)).toEqual(expect.arrayContaining([saved.revisionId, initial.revisionId]))
    await expect(ctx.novelRepository.restoreAssetRevision(novel, {
      assetId: initial.asset.id,
      baseRevisionId: saved.revisionId,
      sourceRevisionId: initial.revisionId,
      restoredBySessionId: SessionId('session-author'),
    })).rejects.toMatchObject({ code: 'NOVEL_REVISION_STALE' })
    await expect(ctx.novelRepository.restoreAssetRevision(novel, {
      assetId: initial.asset.id,
      baseRevisionId: restored.snapshot.revisionId,
      sourceRevisionId: restored.snapshot.revisionId,
      restoredBySessionId: SessionId('session-author'),
    })).rejects.toMatchObject({ code: 'NOVEL_REVISION_STALE' })
  })

  it('persists one inert Story State candidate per finalized chapter Revision', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(dir, 'planning'))
    await writeFile(join(dir, 'novel.yaml'), manifest(['  planning: planning']))
    await writeFile(join(dir, 'manuscript', 'chapter.md'), chapter('chapter-one', '第一章', '林澈抵达白港。'))
    await writeFile(join(dir, 'planning', 'story-state.md'), [
      '---', 'novel:', '  schema: 1', '  id: story-state-one',
      '  type: book.story-state', '  title: 故事状态', '---', '# 当前事实', '',
    ].join('\n'))
    const ctx = await boot(dir, {}, [storyStateTestType])
    const novel = await project(ctx)
    const assets = await ctx.novelRepository.listAssets(novel)
    const chapterAsset = assets.find(value => value.asset.id === 'chapter-one')!
    const storyState = assets.find(value => value.asset.id === 'story-state-one')!
    const pending = await ctx.novelRepository.putStoryStateCandidate(novel, {
      assetId: chapterAsset.asset.id,
      finalRevisionId: chapterAsset.revisionId,
      targetStoryStateAssetId: storyState.asset.id,
      targetStoryStateRevisionId: storyState.revisionId,
      extractorVersion: 'story-state/1',
      generatedAt: '2026-08-27T01:00:00.000Z',
      summary: '林澈抵达白港。',
      replacementMarkdown: '# 当前事实\n\n- 林澈已经抵达白港。',
      evidence: [{ quote: '林澈抵达白港', update: '人物当前位置更新为白港' }],
    })
    expect(pending).toMatchObject({ status: 'pending', targetStoryStateRevisionId: storyState.revisionId })
    await expect(ctx.novelRepository.listStoryStateCandidates(
      novel, chapterAsset.asset.id, chapterAsset.revisionId,
    )).resolves.toEqual([pending])
    await expect(ctx.novelRepository.decideStoryStateCandidate(
      novel, pending.id, 'accepted', SessionId('owner'), undefined,
    )).rejects.toMatchObject({ code: 'NOVEL_STORY_STATE_CANDIDATE_INVALID' })
    const rejected = await ctx.novelRepository.decideStoryStateCandidate(
      novel, pending.id, 'rejected', SessionId('owner'), undefined,
    )
    expect(rejected).toMatchObject({ status: 'rejected', decidedBySessionId: 'owner' })
  })

  it('rejects malformed assets and duplicate stable ids without rewriting authored files', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const malformedPath = join(dir, 'manuscript', 'malformed.md')
    await writeFile(malformedPath, '# missing frontmatter\n')
    const ctx = await boot(dir)
    const novel = await project(ctx)
    await expect(ctx.novelRepository.listAssets(novel))
      .rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })
    expect(await readFile(malformedPath, 'utf8')).toBe('# missing frontmatter\n')

    await rm(malformedPath)
    await writeFile(join(dir, 'manuscript', 'one.md'), chapter('same-id', '一', '一'))
    await writeFile(join(dir, 'manuscript', 'two.md'), chapter('same-id', '二', '二'))
    await expect(ctx.novelRepository.listAssets(novel))
      .rejects.toMatchObject({ code: 'NOVEL_ASSET_DUPLICATE_ID' })
  })

  it('guardedly saves title and body while preserving identity, then rejects stale external writes', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const path = join(dir, 'manuscript', 'chapter.md')
    await writeFile(path, chapter('chapter-one', '第一章', '原稿'))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [initial] = await ctx.novelRepository.listAssets(novel)
    const saved = await ctx.novelRepository.saveAssetContent(novel, {
      assetId: initial!.asset.id,
      baseRevisionId: initial!.revisionId,
      title: '雨夜归人',
      content: { kind: 'manuscript', body: '作者新稿' },
    })
    expect(saved.content).toEqual({ kind: 'manuscript', body: '作者新稿' })
    expect(saved.frontmatter).toMatchObject({ novel: { id: 'chapter-one', title: '雨夜归人' } })
    expect(await readFile(path, 'utf8')).toBe(chapter('chapter-one', '雨夜归人', '作者新稿'))

    await writeFile(path, chapter('chapter-one', '第一章', '编辑器外部新稿'))
    await expect(ctx.novelRepository.saveAssetContent(novel, {
      assetId: initial!.asset.id,
      baseRevisionId: saved.revisionId,
      content: { kind: 'manuscript', body: '不应覆盖' },
    })).rejects.toMatchObject({ code: 'NOVEL_REVISION_STALE' })
    expect(await readFile(path, 'utf8')).toBe(chapter('chapter-one', '第一章', '编辑器外部新稿'))
  })

  it('freezes Chinese, emoji, and CRLF selections on exact retained Revisions', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'chapter.md'), chapter('chapter-one', '第一章', 'A😀白港\r\n末'))
    const ctx = await boot(dir, { selectionContextChars: 2, selectionPreviewChars: 3 })
    const novel = await project(ctx)
    const [asset] = await ctx.novelRepository.listAssets(novel)
    const selection = await ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 1, endUtf16: 5 },
    })
    expect(selection).toMatchObject({
      version: 1,
      assetId: 'chapter-one',
      revisionId: asset!.revisionId,
      selector: {
        kind: 'text-range',
        startUtf16: 1,
        endUtf16: 5,
        prefix: 'A',
        suffix: '\r\n',
      },
      preview: '😀白…',
    })
    expect(selection.selector.quoteHash).toBe(
      `sha256:${createHash('sha256').update('😀白港').digest('hex')}`,
    )
    await expect(ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 2, endUtf16: 5 },
    })).rejects.toMatchObject({ code: 'NOVEL_SELECTION_INVALID' })
  })

  it('refuses an unknown history schema without resetting or modifying it', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(dir, '.novel'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'chapter.md'), chapter('chapter-one', '第一章', '正文'))
    const historyPath = join(dir, '.novel', 'history.sqlite')
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(historyPath)
    db.exec('PRAGMA application_id = 1146310216; PRAGMA user_version = 99')
    db.close()

    const ctx = await boot(dir)
    const novel = await project(ctx)
    await expect(ctx.novelRepository.listAssets(novel))
      .rejects.toMatchObject({ code: 'NOVEL_HISTORY_SCHEMA_UNSUPPORTED' })
    const retained = new DatabaseSync(historyPath)
    const row = retained.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(row.user_version).toBe(99)
    retained.close()
  })

  it('sorts multiple assets and fails closed for missing assets and invalid save bodies', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'z.md'), chapter('chapter-z', 'Z', '短'))
    await writeFile(join(dir, 'manuscript', 'a.md'), chapter('chapter-a', 'A', '短'))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const assets = await ctx.novelRepository.listAssets(novel)
    expect(assets.map(value => value.asset.projectRelativePath)).toEqual([
      'manuscript/a.md',
      'manuscript/z.md',
    ])
    await expect(ctx.novelRepository.readAsset(novel, AssetId('missing')))
      .rejects.toMatchObject({ code: 'NOVEL_ASSET_NOT_FOUND' })
    await expect(ctx.novelRepository.readAsset(novel, AssetId('chapter-a'), RevisionId('missing')))
      .rejects.toMatchObject({ code: 'NOVEL_REVISION_NOT_FOUND' })
    await expect(ctx.novelRepository.saveAssetContent(novel, {
      assetId: AssetId('missing'),
      baseRevisionId: RevisionId('missing'),
      content: { kind: 'manuscript', body: 'body' },
    })).rejects.toMatchObject({ code: 'NOVEL_ASSET_NOT_FOUND' })
    await expect(ctx.novelRepository.saveAssetContent(novel, {
      assetId: assets[0]!.asset.id,
      baseRevisionId: assets[0]!.revisionId,
      content: { kind: 'manuscript', body: '\uD83D' },
    })).rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })
  })

  it('enforces asset byte, count, depth, cancellation, and selection bounds', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript', 'nested'), { recursive: true })
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const serialized = chapter('chapter-one', 'One', 'A😀B')
    await writeFile(join(dir, 'manuscript', 'one.md'), serialized)
    await writeFile(join(dir, 'manuscript', 'ignored.txt'), 'not an asset')

    const bytesCtx = await boot(dir, { assetMaxBytes: Buffer.byteLength(serialized) })
    const bytesProject = await project(bytesCtx)
    const [asset] = await bytesCtx.novelRepository.listAssets(bytesProject)
    await expect(bytesCtx.novelRepository.saveAssetContent(bytesProject, {
      assetId: asset!.asset.id,
      baseRevisionId: asset!.revisionId,
      content: { kind: 'manuscript', body: 'this body is deliberately much larger than the original' },
    })).rejects.toMatchObject({ code: 'NOVEL_ASSET_TOO_LARGE' })

    const requests = [
      { startUtf16: Number.NaN, endUtf16: 1 },
      { startUtf16: 0, endUtf16: Number.NaN },
      { startUtf16: -1, endUtf16: 1 },
      { startUtf16: 1, endUtf16: 1 },
      { startUtf16: 0, endUtf16: 99 },
      { startUtf16: 2, endUtf16: 4 },
      { startUtf16: 0, endUtf16: 2 },
    ]
    for (const range of requests) {
      await expect(bytesCtx.novelRepository.captureSelection(bytesProject, {
        assetId: asset!.asset.id,
        revisionId: asset!.revisionId,
        selector: { kind: 'text-range', ...range },
      })).rejects.toMatchObject({ code: 'NOVEL_SELECTION_INVALID' })
    }
    await expect(bytesCtx.novelRepository.captureSelection(bytesProject, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    })).resolves.toMatchObject({ preview: 'A', selector: { suffix: '😀B' } })
    await expect(bytesCtx.novelRepository.captureSelection(bytesProject, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 3, endUtf16: 4 },
    })).resolves.toMatchObject({ preview: 'B', selector: { prefix: 'A😀' } })
    const aborted = new AbortController()
    aborted.abort()
    await expect(bytesCtx.novelRepository.readAsset(bytesProject, asset!.asset.id, undefined, aborted.signal))
      .rejects.toThrow()

    const countCtx = await boot(dir, { maxAssets: 1 })
    const countProject = await project(countCtx)
    await writeFile(join(dir, 'manuscript', 'two.md'), chapter('chapter-two', 'Two', 'body'))
    await expect(countCtx.novelRepository.listAssets(countProject))
      .rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })

    const depthCtx = await boot(dir, { scanMaxDepth: 1 })
    const depthProject = await project(depthCtx)
    await mkdir(join(dir, 'manuscript', 'nested', 'too-deep'))
    await expect(depthCtx.novelRepository.listAssets(depthProject))
      .rejects.toMatchObject({ code: 'NOVEL_ASSET_INVALID' })
  })

  it('translates guarded filesystem races while passing unrelated write failures through', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', 'body'))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [listed] = await ctx.novelRepository.listAssets(novel)
    const asset = await ctx.novelRepository.readAsset(novel, listed!.asset.id, listed!.revisionId)
    const original = ctx.fs.writeText.bind(ctx.fs)
    ctx.fs.writeText = () => Promise.reject(new Error('disk offline'))
    await expect(ctx.novelRepository.saveAssetContent(novel, {
      assetId: asset.asset.id,
      baseRevisionId: asset.revisionId,
      content: { kind: 'manuscript', body: 'new' },
    })).rejects.toThrow('disk offline')
    ctx.fs.writeText = () => Promise.reject(new FsError('stale', 'FS_STALE_VERSION'))
    await expect(ctx.novelRepository.saveAssetContent(novel, {
      assetId: asset.asset.id,
      baseRevisionId: asset.revisionId,
      content: { kind: 'manuscript', body: 'new' },
    })).rejects.toMatchObject({ code: 'NOVEL_REVISION_STALE' })
    ctx.fs.writeText = original
  })

  it('rejects absent manuscript roots, escaped scan entries, and conflicting project identities', async () => {
    const dir = await tempDir()
    const other = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await mkdir(join(other, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(other, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', 'body'))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    await expect(ctx.novelRepository.listAssets({ ...novel, contentRoots: {} }))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' })

    const originalContains = ctx.fs.contains.bind(ctx.fs)
    ctx.fs.contains = (parent, child) => child.displayPath.endsWith('one.md') ? false : originalContains(parent, child)
    await expect(ctx.novelRepository.listAssets(novel))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_PATH_ESCAPE' })
    ctx.fs.contains = originalContains

    await expect(ctx.novelRepository.discoverProject(await ctx.fs.resolve(other)))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_ID_CONFLICT' })
    await ctx.novelRepository.listAssets(novel)
    await expect(ctx.novelRepository.listAssets({ ...novel, id: ProjectId('different-project') }))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_ID_CONFLICT' })
  })

  it('refuses foreign and unversioned history databases and rolls back failed Revision commits', async () => {
    async function expectHistoryFailure(setup: (db: import('node:sqlite').DatabaseSync) => void, code: string): Promise<void> {
      const dir = await tempDir()
      await mkdir(join(dir, 'manuscript'))
      await mkdir(join(dir, '.novel'))
      await writeFile(join(dir, 'novel.yaml'), manifest())
      await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', 'body'))
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(join(dir, '.novel', 'history.sqlite'))
      setup(db)
      db.close()
      const ctx = await boot(dir)
      await expect(ctx.novelRepository.listAssets(await project(ctx))).rejects.toMatchObject({ code })
    }
    await expectHistoryFailure((db) => {
      db.exec('CREATE TABLE unexpected(value TEXT) STRICT')
    }, 'NOVEL_HISTORY_CORRUPT')
    await expectHistoryFailure((db) => {
      db.exec(`PRAGMA application_id = ${NOVEL_HISTORY_APPLICATION_ID + 1}; PRAGMA user_version = 1`)
    }, 'NOVEL_HISTORY_CORRUPT')

    const dir = await tempDir()
    const history = await openHistory(join(dir, 'history.sqlite'), 100, decodeHistoryOperations)
    const revision = {
      id: RevisionId('revision-one'),
      projectId: ProjectId('project-one'),
      assetId: AssetId('asset-one'),
      serializedUtf8: new TextEncoder().encode('bytes'),
      contentHash: `sha256:${createHash('sha256').update('bytes').digest('hex')}` as const,
      origin: 'initial-scan' as const,
      createdAt: new Date(0).toISOString(),
    }
    history.commitRevision(revision, 'manuscript/one.md')
    expect(() => {
      history.commitRevision(revision, 'manuscript/one.md')
    }).toThrow()
    expect(history.revision(RevisionId('missing'))).toBeUndefined()
    history.close()
    const reopened = await openHistory(join(dir, 'history.sqlite'), 100, decodeHistoryOperations)
    expect(reopened.head(ProjectId('project-one'), AssetId('asset-one'))).toMatchObject({ revision_id: 'revision-one' })
    reopened.close()
  })

  it('detects scan races before and after reads and accepts live cancellation signals', async () => {
    async function race(afterRead: boolean): Promise<void> {
      const dir = await tempDir()
      await mkdir(join(dir, 'manuscript'))
      await writeFile(join(dir, 'novel.yaml'), manifest())
      await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', 'body'))
      const ctx = await boot(dir)
      const signal = new AbortController().signal
      const novel = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'), signal)
      if (novel === undefined) throw new Error('expected Novel Project')
      const original = ctx.fs.stat.bind(ctx.fs)
      let assetStats = 0
      ctx.fs.stat = async (target, passedSignal) => {
        if (target.displayPath.endsWith('one.md')) {
          assetStats += 1
          if ((!afterRead && assetStats === 1) || (afterRead && assetStats === 2)) return undefined
        }
        return await original(target, passedSignal)
      }
      await expect(ctx.novelRepository.listAssets(novel))
        .rejects.toMatchObject({ code: 'NOVEL_ASSET_CHANGED_DURING_SCAN' })
      ctx.fs.stat = original
    }
    await race(false)
    await race(true)
  })

  it('rejects corrupted current and retained Revision rows', async () => {
    async function fixture(): Promise<{
      ctx: Context
      dir: string
      novel: Awaited<ReturnType<typeof project>>
      assetId: AssetId
      revisionId: RevisionId
    }> {
      const dir = await tempDir()
      await mkdir(join(dir, 'manuscript'))
      await writeFile(join(dir, 'novel.yaml'), manifest())
      await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', 'body'))
      const ctx = await boot(dir)
      const novel = await project(ctx)
      const [asset] = await ctx.novelRepository.listAssets(novel)
      return { ctx, dir, novel, assetId: asset!.asset.id, revisionId: asset!.revisionId }
    }
    const { DatabaseSync } = await import('node:sqlite')

    const current = await fixture()
    const currentDb = new DatabaseSync(join(current.dir, '.novel', 'history.sqlite'))
    currentDb.prepare('UPDATE revisions SET content_hash = ? WHERE id = ?').run(
      `sha256:${'0'.repeat(64)}`,
      current.revisionId,
    )
    currentDb.close()
    await expect(current.ctx.novelRepository.listAssets(current.novel))
      .rejects.toMatchObject({ code: 'NOVEL_HISTORY_CORRUPT' })

    const retainedHash = await fixture()
    const hashDb = new DatabaseSync(join(retainedHash.dir, '.novel', 'history.sqlite'))
    hashDb.prepare('UPDATE revisions SET content_hash = ? WHERE id = ?').run(
      `sha256:${'0'.repeat(64)}`,
      retainedHash.revisionId,
    )
    hashDb.close()
    await expect(retainedHash.ctx.novelRepository.readAsset(
      retainedHash.novel,
      retainedHash.assetId,
      retainedHash.revisionId,
    )).rejects.toMatchObject({ code: 'NOVEL_HISTORY_CORRUPT' })

    const retainedId = await fixture()
    const otherBytes = new TextEncoder().encode(chapter('other-id', 'Other', 'body'))
    const idDb = new DatabaseSync(join(retainedId.dir, '.novel', 'history.sqlite'))
    idDb.prepare('UPDATE revisions SET serialized_utf8 = ?, content_hash = ? WHERE id = ?').run(
      Buffer.from(otherBytes),
      `sha256:${createHash('sha256').update(otherBytes).digest('hex')}`,
      retainedId.revisionId,
    )
    idDb.close()
    await expect(retainedId.ctx.novelRepository.readAsset(
      retainedId.novel,
      retainedId.assetId,
      retainedId.revisionId,
    )).rejects.toMatchObject({ code: 'NOVEL_HISTORY_CORRUPT' })
  })

  it('keeps bounded selection diagnostics on complete Unicode code-point boundaries', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', 'X😀Y'))
    const ctx = await boot(dir, { selectionContextChars: 1, selectionPreviewChars: 1 })
    const novel = await project(ctx)
    const [asset] = await ctx.novelRepository.listAssets(novel)
    await expect(ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 1, endUtf16: 3 },
    })).resolves.toMatchObject({ preview: '…' })
    await expect(ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 3, endUtf16: 4 },
    })).resolves.toMatchObject({ selector: { startUtf16: 3, endUtf16: 4 } })
    const leading = await ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    })
    expect(leading.selector.suffix).toBeUndefined()
  })

  it('retains proposals without touching files and requires the owning Session to decide them', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const path = join(dir, 'manuscript', 'one.md')
    const original = chapter('chapter-one', 'One', '白港下雨了。')
    await writeFile(path, original)
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [asset] = await ctx.novelRepository.listAssets(novel)
    const selection = await ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 2, endUtf16: 4 },
    })
    const owner = SessionId('novel-owner')
    const generation = {
      sessionId: owner,
      turn: 4,
      provider: 'test-provider',
      model: 'test-writer',
      presetId: 'novel-workbench',
      skillName: 'chapter-execution',
      skillVersion: 1,
      contextManifestId: `sha256:${'a'.repeat(64)}` as const,
      contextPolicies: ['chapter-write'],
      strategy: 'action-options-agent-selected' as const,
      actionPlanCount: 3,
      selectedActionPlan: 2,
    }
    const proposed = await ctx.novelRepository.proposeChangeSet(novel, {
      assetId: asset!.asset.id,
      baseRevisionId: asset!.revisionId,
      operations: [{ kind: 'replace-text', selector: selection.selector, replacement: '放晴' }],
      actor: { kind: 'agent', sessionId: owner },
      summary: '把天气改为放晴',
      generation,
    })

    expect(proposed.status).toBe('proposed')
    expect(proposed.generation).toEqual(generation)
    expect(await readFile(path, 'utf8')).toBe(original)
    await expect(ctx.novelRepository.applyChangeSet(
      novel,
      proposed.id,
      { sessionId: SessionId('another-session') },
    )).rejects.toMatchObject({ code: 'NOVEL_CHANGESET_UNAUTHORIZED' })
    const applied = await ctx.novelRepository.applyChangeSet(novel, proposed.id, { sessionId: owner })
    expect(applied.status).toBe('applied')
    expect(applied.resultRevisionId).toMatch(/^revision_/u)
    expect((await ctx.novelRepository.readAsset(novel, asset!.asset.id)).content)
      .toEqual({ kind: 'manuscript', body: '白港放晴了。' })
    expect((await ctx.novelRepository.listAssetRevisions(novel, asset!.asset.id))[0]?.generation)
      .toEqual(generation)
    await expect(ctx.novelRepository.applyChangeSet(novel, proposed.id, { sessionId: owner }))
      .resolves.toEqual(applied)
  })

  it('inserts prose into an empty retained chapter through a reviewable ChangeSet', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'empty.md'), chapter('chapter-empty', '未命名章节', ''))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [listed] = await ctx.novelRepository.listAssets(novel)
    const asset = await ctx.novelRepository.readAsset(novel, listed!.asset.id, listed!.revisionId)
    const owner = SessionId('novel-owner')
    const definition = ctx.novelAssetTypes.get('manuscript.chapter')
    const operations = definition.prepareOperations(asset, [{
      kind: 'update-title', title: '第1章 华夏无神',
    }, {
      kind: 'insert-text', atUtf16: 0, text: '天门之外，鼓声骤起。',
    }])
    const proposed = await ctx.novelRepository.proposeChangeSet(novel, {
      assetId: asset.asset.id,
      baseRevisionId: asset.revisionId,
      operations,
      actor: { kind: 'agent', sessionId: owner },
      summary: '写入第一章正文',
    })

    expect(proposed.operations).toEqual([{
      kind: 'update-title', title: '第1章 华夏无神',
    }, {
      kind: 'insert-text', atUtf16: 0, text: '天门之外，鼓声骤起。',
    }])
    expect((await ctx.novelRepository.readAsset(novel, asset.asset.id)).content)
      .toEqual({ kind: 'manuscript', body: '' })
    await ctx.novelRepository.applyChangeSet(novel, proposed.id, { sessionId: owner })
    expect(await ctx.novelRepository.readAsset(novel, asset.asset.id)).toMatchObject({
      frontmatter: { novel: { title: '第1章 华夏无神' } },
      content: { kind: 'manuscript', body: '天门之外，鼓声骤起。' },
    })
  })

  it('rejects proposals idempotently and converts stale proposals into durable conflicts', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', '旧正文'))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [asset] = await ctx.novelRepository.listAssets(novel)
    const selection = await ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    })
    const owner = SessionId('novel-owner')
    const request = {
      assetId: asset!.asset.id,
      baseRevisionId: asset!.revisionId,
      operations: [{ kind: 'replace-text' as const, selector: selection.selector, replacement: '新' }],
      actor: { kind: 'agent' as const, sessionId: owner },
      summary: '修改首字',
    }
    const rejected = await ctx.novelRepository.proposeChangeSet(novel, request)
    await expect(ctx.novelRepository.rejectChangeSet(novel, rejected.id, { sessionId: owner }))
      .resolves.toMatchObject({ status: 'rejected' })
    await expect(ctx.novelRepository.rejectChangeSet(novel, rejected.id, { sessionId: owner }))
      .resolves.toMatchObject({ status: 'rejected' })

    const stale = await ctx.novelRepository.proposeChangeSet(novel, request)
    await ctx.novelRepository.saveAssetContent(novel, {
      assetId: asset!.asset.id,
      baseRevisionId: asset!.revisionId,
      content: { kind: 'manuscript', body: '作者的新正文' },
    })
    await expect(ctx.novelRepository.applyChangeSet(novel, stale.id, { sessionId: owner }))
      .resolves.toMatchObject({ status: 'conflicted' })
    await expect(ctx.novelRepository.readChangeSet(novel, stale.id))
      .resolves.toMatchObject({ status: 'conflicted' })
  })

  it.each<ApplyFaultStage>(['after-journal', 'after-file'])(
    'recovers an interrupted apply at the %s durability boundary',
    async (faultStage) => {
      const dir = await tempDir()
      await mkdir(join(dir, 'manuscript'))
      await writeFile(join(dir, 'novel.yaml'), manifest())
      await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', '白港下雨'))
      const first = await boot(dir)
      const firstProject = await project(first)
      const [asset] = await first.novelRepository.listAssets(firstProject)
      const selection = await first.novelRepository.captureSelection(firstProject, {
        assetId: asset!.asset.id,
        revisionId: asset!.revisionId,
        selector: { kind: 'text-range', startUtf16: 2, endUtf16: 4 },
      })
      const owner = SessionId('novel-owner')
      const proposed = await first.novelRepository.proposeChangeSet(firstProject, {
        assetId: asset!.asset.id,
        baseRevisionId: asset!.revisionId,
        operations: [{ kind: 'replace-text', selector: selection.selector, replacement: '放晴' }],
        actor: { kind: 'agent', sessionId: owner },
        summary: '恢复可发布修改',
      })
      const removeFault = installApplyFault(first.root, (stage) => {
        if (stage === faultStage) throw new Error(`simulated crash ${stage}`)
      })
      await expect(first.novelRepository.applyChangeSet(firstProject, proposed.id, { sessionId: owner }))
        .rejects.toThrow(`simulated crash ${faultStage}`)
      removeFault()
      if (faultStage === 'after-journal') {
        await expect(first.novelRepository.rejectChangeSet(firstProject, proposed.id, { sessionId: owner }))
          .rejects.toMatchObject({ code: 'NOVEL_CHANGESET_INVALID' })
      }
      await first.fiber.dispose()

      const restarted = await boot(dir)
      const restartedProject = await project(restarted)
      await restarted.novelRepository.listAssets(restartedProject)
      const recovered = await restarted.novelRepository.readChangeSet(restartedProject, proposed.id)
      expect(recovered.status).toBe('applied')
      expect(recovered.resultRevisionId).toMatch(/^revision_/u)
      expect((await restarted.novelRepository.readAsset(restartedProject, asset!.asset.id)).content)
        .toEqual({ kind: 'manuscript', body: '白港放晴' })
    },
  )

  it('migrates an identified version-one history database to generation-lineage schema eight', async () => {
    const dir = await tempDir()
    const path = join(dir, 'history.sqlite')
    const { DatabaseSync } = await import('node:sqlite')
    const seed = new DatabaseSync(path)
    seed.exec(`PRAGMA application_id = ${NOVEL_HISTORY_APPLICATION_ID}; PRAGMA user_version = 1`)
    seed.close()

    const history = await openHistory(path, 100, decodeHistoryOperations)
    history.close()
    const migrated = new DatabaseSync(path)
    expect((migrated.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(8)
    expect((migrated.prepare('PRAGMA table_info(change_sets)').all() as Array<{ name: string }>).map(row => row.name))
      .toEqual(expect.arrayContaining(['asset_type', 'generation_json']))
    expect((migrated.prepare('PRAGMA table_info(revisions)').all() as Array<{ name: string }>).map(row => row.name))
      .toEqual(expect.arrayContaining(['restored_from_revision_id', 'restored_by_session_id', 'generation_json']))
    const tables = migrated.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('change_sets', 'apply_journal', 'analysis_reports', 'revision_finalizations', 'preference_candidates', 'story_state_candidates')
      ORDER BY name
    `).all() as Array<{ name: string }>
    expect(tables.map(row => row.name)).toEqual([
      'analysis_reports', 'apply_journal', 'change_sets', 'preference_candidates', 'revision_finalizations',
      'story_state_candidates',
    ])
    migrated.close()
  })

  it('validates proposal summaries, operations, UTF-16 ranges, quote hashes, and missing ids', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const path = join(dir, 'manuscript', 'one.md')
    await writeFile(path, chapter('chapter-one', 'One', 'A😀BC'))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [asset] = await ctx.novelRepository.listAssets(novel)
    const frozen = await ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    })
    const valid = {
      assetId: asset!.asset.id,
      baseRevisionId: asset!.revisionId,
      operations: [{ kind: 'replace-text' as const, selector: frozen.selector, replacement: 'Z' }],
      actor: { kind: 'user' as const },
      summary: 'Replace the first letter',
    }
    for (const summary of ['', ' padded ', 'x'.repeat(501)]) {
      await expect(ctx.novelRepository.proposeChangeSet(novel, { ...valid, summary }))
        .rejects.toMatchObject({ code: 'NOVEL_CHANGESET_INVALID' })
    }
    for (const operations of [[], [...valid.operations, ...valid.operations]]) {
      await expect(ctx.novelRepository.proposeChangeSet(novel, { ...valid, operations }))
        .rejects.toMatchObject({ code: 'NOVEL_CHANGESET_INVALID' })
    }
    await expect(ctx.novelRepository.proposeChangeSet(novel, {
      ...valid,
      operations: [{ ...valid.operations[0]!, replacement: '\uD83D' }],
    })).rejects.toMatchObject({ code: 'NOVEL_CHANGESET_INVALID' })

    const invalidSelectors = [
      { startUtf16: Number.NaN, endUtf16: 1 },
      { startUtf16: 0, endUtf16: Number.NaN },
      { startUtf16: -1, endUtf16: 1 },
      { startUtf16: 1, endUtf16: 1 },
      { startUtf16: 0, endUtf16: 99 },
      { startUtf16: 2, endUtf16: 3 },
      { startUtf16: 0, endUtf16: 2 },
    ]
    for (const offsets of invalidSelectors) {
      await expect(ctx.novelRepository.proposeChangeSet(novel, {
        ...valid,
        operations: [{
          ...valid.operations[0]!,
          selector: { ...frozen.selector, ...offsets },
        }],
      })).rejects.toMatchObject({ code: 'NOVEL_CHANGESET_INVALID' })
    }
    const invalidQuoteHash: ContentHash = `sha256:${'0'.repeat(64)}`
    await expect(ctx.novelRepository.proposeChangeSet(novel, {
      ...valid,
      operations: [{
        ...valid.operations[0]!, selector: { ...frozen.selector, quoteHash: invalidQuoteHash },
      }],
    })).rejects.toMatchObject({ code: 'NOVEL_CHANGESET_INVALID' })

    const boundedDir = await tempDir()
    await mkdir(join(boundedDir, 'manuscript'))
    await writeFile(join(boundedDir, 'novel.yaml'), manifest())
    const boundedText = chapter('chapter-bounded', 'Bounded', 'A')
    await writeFile(join(boundedDir, 'manuscript', 'one.md'), boundedText)
    const bounded = await boot(boundedDir, { assetMaxBytes: Buffer.byteLength(boundedText) })
    const boundedProject = await project(bounded)
    const [boundedAsset] = await bounded.novelRepository.listAssets(boundedProject)
    const boundedSelection = await bounded.novelRepository.captureSelection(boundedProject, {
      assetId: boundedAsset!.asset.id,
      revisionId: boundedAsset!.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    })
    await expect(bounded.novelRepository.proposeChangeSet(boundedProject, {
      assetId: boundedAsset!.asset.id,
      baseRevisionId: boundedAsset!.revisionId,
      operations: [{ kind: 'replace-text', selector: boundedSelection.selector, replacement: 'far too large' }],
      actor: { kind: 'user' },
      summary: 'Exceed the serialized Asset budget',
    })).rejects.toMatchObject({ code: 'NOVEL_CHANGESET_INVALID' })

    const ownedByUser = await ctx.novelRepository.proposeChangeSet(novel, valid)
    await expect(ctx.novelRepository.readChangeSet(novel, ownedByUser.id))
      .resolves.toMatchObject({ actor: { kind: 'user' } })
    const userSession = await ctx.novelRepository.proposeChangeSet(novel, {
      ...valid, actor: { kind: 'user', sessionId: SessionId('user-session') }, summary: 'User Session proposal',
    })
    await expect(ctx.novelRepository.readChangeSet(novel, userSession.id))
      .resolves.toMatchObject({ actor: { kind: 'user', sessionId: 'user-session' } })

    const missing = ChangeSetId('missing-change-set')
    await expect(ctx.novelRepository.readChangeSet(novel, missing))
      .rejects.toMatchObject({ code: 'NOVEL_CHANGESET_NOT_FOUND' })
    await expect(ctx.novelRepository.applyChangeSet(novel, missing, { sessionId: SessionId('user-session') }))
      .rejects.toMatchObject({ code: 'NOVEL_CHANGESET_NOT_FOUND' })
    await expect(ctx.novelRepository.rejectChangeSet(novel, missing, { sessionId: SessionId('user-session') }))
      .rejects.toMatchObject({ code: 'NOVEL_CHANGESET_NOT_FOUND' })

    const removed = await ctx.novelRepository.proposeChangeSet(novel, { ...valid, summary: 'Asset disappears' })
    await rm(path)
    await expect(ctx.novelRepository.applyChangeSet(novel, removed.id, { sessionId: SessionId('any-session') }))
      .resolves.toMatchObject({ status: 'conflicted' })
  })

  it('converts guarded apply races to conflicts and recovers unrelated pre-write failures', async () => {
    async function fixture(summary: string): Promise<{
      ctx: Context
      novel: Awaited<ReturnType<typeof project>>
      proposed: ChangeSet
    }> {
      const dir = await tempDir()
      await mkdir(join(dir, 'manuscript'))
      await writeFile(join(dir, 'novel.yaml'), manifest())
      await writeFile(join(dir, 'manuscript', 'one.md'), chapter('chapter-one', 'One', '旧正文'))
      const ctx = await boot(dir)
      const novel = await project(ctx)
      const [asset] = await ctx.novelRepository.listAssets(novel)
      const selected = await ctx.novelRepository.captureSelection(novel, {
        assetId: asset!.asset.id,
        revisionId: asset!.revisionId,
        selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
      })
      const proposed = await ctx.novelRepository.proposeChangeSet(novel, {
        assetId: asset!.asset.id,
        baseRevisionId: asset!.revisionId,
        operations: [{ kind: 'replace-text', selector: selected.selector, replacement: '新' }],
        actor: { kind: 'agent', sessionId: SessionId('owner') },
        summary,
      })
      return { ctx, novel, proposed }
    }

    const stale = await fixture('Stale guarded write')
    const staleWrite = stale.ctx.fs.writeText.bind(stale.ctx.fs)
    stale.ctx.fs.writeText = () => Promise.reject(new FsError('stale', 'FS_STALE_VERSION'))
    await expect(stale.ctx.novelRepository.applyChangeSet(
      stale.novel, stale.proposed.id, { sessionId: SessionId('owner') },
    )).resolves.toMatchObject({ status: 'conflicted' })
    stale.ctx.fs.writeText = staleWrite

    const offline = await fixture('Recover after storage error')
    const offlineWrite = offline.ctx.fs.writeText.bind(offline.ctx.fs)
    offline.ctx.fs.writeText = () => Promise.reject(new Error('storage offline during apply'))
    await expect(offline.ctx.novelRepository.applyChangeSet(
      offline.novel, offline.proposed.id, { sessionId: SessionId('owner') },
    )).rejects.toThrow('storage offline during apply')
    offline.ctx.fs.writeText = offlineWrite
    await expect(offline.ctx.novelRepository.applyChangeSet(
      offline.novel, offline.proposed.id, { sessionId: SessionId('owner') },
    )).resolves.toMatchObject({ status: 'applied' })
  })

  it('fails closed for every corrupted persisted ChangeSet field and rolls back schema setup failures', async () => {
    const dir = await tempDir()
    const path = join(dir, 'history.sqlite')
    const bytes = new TextEncoder().encode(chapter('asset-one', 'One', 'body'))
    const hash: ContentHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const baseRevision = {
      id: RevisionId('revision-base'),
      projectId: ProjectId('project-one'),
      assetId: AssetId('asset-one'),
      serializedUtf8: bytes,
      contentHash: hash,
      origin: 'initial-scan' as const,
      createdAt: new Date(0).toISOString(),
    }
    const validOperation = {
      kind: 'replace-text' as const,
      selector: { kind: 'text-range' as const, startUtf16: 0, endUtf16: 1, quoteHash: hash },
      replacement: 'B',
    }
    const changeSet: ChangeSet = {
      id: ChangeSetId('changeset-corrupt'),
      projectId: baseRevision.projectId,
      assetId: baseRevision.assetId,
      assetType: 'manuscript.chapter',
      baseRevisionId: baseRevision.id,
      operations: [validOperation],
      actor: { kind: 'user' },
      summary: 'proposal',
      status: 'proposed',
    }
    const history = await openHistory(path, 100, decodeHistoryOperations)
    history.commitRevision(baseRevision, 'manuscript/one.md')
    history.proposeChangeSet(changeSet)
    expect(history.rejectChangeSet(ChangeSetId('missing'))).toBeUndefined()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path)
    const validOperationsJson = JSON.stringify(changeSet.operations)
    const validActorJson = JSON.stringify(changeSet.actor)
    const invalidOperations = [
      '{',
      '{}',
      '[]',
      '[null]',
      JSON.stringify([{ ...validOperation, kind: 'other' }]),
      JSON.stringify([{ ...validOperation, replacement: 1 }]),
      JSON.stringify([{ ...validOperation, selector: null }]),
      JSON.stringify([{ ...validOperation, selector: { ...validOperation.selector, kind: 'other' } }]),
      JSON.stringify([{ ...validOperation, selector: { ...validOperation.selector, startUtf16: 0.5 } }]),
      JSON.stringify([{ ...validOperation, selector: { ...validOperation.selector, endUtf16: 1.5 } }]),
      JSON.stringify([{ ...validOperation, selector: { ...validOperation.selector, quoteHash: 1 } }]),
      JSON.stringify([{ ...validOperation, selector: { ...validOperation.selector, prefix: 1 } }]),
      JSON.stringify([{ ...validOperation, selector: { ...validOperation.selector, suffix: 1 } }]),
    ]
    for (const operations of invalidOperations) {
      db.prepare('UPDATE change_sets SET operations_json = ? WHERE id = ?').run(operations, changeSet.id)
      expect(() => history.changeSet(changeSet.id)).toThrow(expect.objectContaining({ code: 'NOVEL_HISTORY_CORRUPT' }))
    }
    db.prepare('UPDATE change_sets SET operations_json = ? WHERE id = ?').run(validOperationsJson, changeSet.id)
    for (const actor of ['{', 'null', '{"kind":"other"}', '{"kind":"agent"}', '{"kind":"user","sessionId":1}']) {
      db.prepare('UPDATE change_sets SET actor_json = ? WHERE id = ?').run(actor, changeSet.id)
      expect(() => history.changeSet(changeSet.id)).toThrow(expect.objectContaining({ code: 'NOVEL_HISTORY_CORRUPT' }))
    }
    db.prepare('UPDATE change_sets SET actor_json = ? WHERE id = ?').run(validActorJson, changeSet.id)
    db.exec('PRAGMA ignore_check_constraints = ON')
    db.prepare('UPDATE change_sets SET status = ? WHERE id = ?').run('unknown', changeSet.id)
    expect(() => history.changeSet(changeSet.id)).toThrow(expect.objectContaining({ code: 'NOVEL_HISTORY_CORRUPT' }))
    db.prepare('UPDATE change_sets SET status = ? WHERE id = ?').run('proposed', changeSet.id)

    const rejected = history.rejectChangeSet(changeSet.id)!
    expect(rejected.status).toBe('rejected')
    expect(history.rejectChangeSet(changeSet.id)).toEqual(rejected)
    const journal = {
      changeSetId: changeSet.id,
      authorizedSessionId: SessionId('owner'),
      projectRelativePath: 'manuscript/one.md',
      beforeHash: hash,
      afterHash: hash,
      afterUtf8: bytes,
      resultRevisionId: RevisionId('revision-result'),
      createdAt: new Date(1).toISOString(),
    }
    expect(() => history.startApply(changeSet.id, journal))
      .toThrow(expect.objectContaining({ code: 'NOVEL_HISTORY_CORRUPT' }))

    const finalizeId = ChangeSetId('changeset-finalize-invalid')
    history.proposeChangeSet({ ...changeSet, id: finalizeId, status: 'proposed' })
    expect(() => history.finalizeApply(finalizeId, {
      ...baseRevision,
      id: RevisionId('revision-finalize'),
      parentRevisionId: baseRevision.id,
      origin: 'agent-apply',
    }, 'manuscript/one.md')).toThrow(expect.objectContaining({ code: 'NOVEL_HISTORY_CORRUPT' }))
    expect(history.revision(RevisionId('revision-finalize'))).toBeUndefined()

    const vanishedId = ChangeSetId('changeset-vanished')
    history.proposeChangeSet({ ...changeSet, id: vanishedId, status: 'proposed' })
    db.exec(`
      CREATE TRIGGER remove_conflicted_change_set
      AFTER UPDATE OF status ON change_sets
      WHEN NEW.id = 'changeset-vanished' AND NEW.status = 'conflicted'
      BEGIN DELETE FROM change_sets WHERE id = NEW.id; END
    `)
    expect(() => history.conflictApply(vanishedId))
      .toThrow(expect.objectContaining({ code: 'NOVEL_HISTORY_CORRUPT' }))
    db.close()
    history.close()

    const brokenPath = join(dir, 'broken.sqlite')
    const broken = new DatabaseSync(brokenPath)
    broken.exec(`
      PRAGMA application_id = ${NOVEL_HISTORY_APPLICATION_ID};
      PRAGMA user_version = 1;
      CREATE TABLE change_sets(dummy TEXT) STRICT;
    `)
    broken.close()
    await expect(openHistory(brokenPath, 100, decodeHistoryOperations)).rejects.toThrow()
    const after = new DatabaseSync(brokenPath)
    expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1)
    expect((after.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'revisions'").get() as { count: number }).count).toBe(0)
    after.close()
  })

  it('recovers or rejects every interrupted-apply restart state deterministically', async () => {
    type RecoveryMode =
      | 'status-mismatch'
      | 'missing-file'
      | 'moved-file'
      | 'external-drift'
      | 'corrupt-payload-id'
      | 'corrupt-payload-hash'
      | 'stale-recovery-write'
      | 'failed-recovery-write'
      | 'non-stale-fs-recovery-write'

    async function interrupted(mode: RecoveryMode) {
      const dir = await tempDir()
      await mkdir(join(dir, 'manuscript'))
      await writeFile(join(dir, 'novel.yaml'), manifest())
      const path = join(dir, 'manuscript', 'one.md')
      await writeFile(path, chapter('chapter-one', 'One', '白港下雨'))
      const first = await boot(dir)
      const firstProject = await project(first)
      const [asset] = await first.novelRepository.listAssets(firstProject)
      const selection = await first.novelRepository.captureSelection(firstProject, {
        assetId: asset!.asset.id,
        revisionId: asset!.revisionId,
        selector: { kind: 'text-range', startUtf16: 2, endUtf16: 4 },
      })
      const proposed = await first.novelRepository.proposeChangeSet(firstProject, {
        assetId: asset!.asset.id,
        baseRevisionId: asset!.revisionId,
        operations: [{ kind: 'replace-text', selector: selection.selector, replacement: '放晴' }],
        actor: { kind: 'agent', sessionId: SessionId('owner') },
        summary: `Recovery ${mode}`,
      })
      const removeFault = installApplyFault(first.root, (stage) => {
        if (stage === 'after-journal') throw new Error('interrupt after journal')
      })
      await expect(first.novelRepository.applyChangeSet(firstProject, proposed.id, { sessionId: SessionId('owner') }))
        .rejects.toThrow('interrupt after journal')
      removeFault()
      await first.fiber.dispose()

      const historyPath = join(dir, '.novel', 'history.sqlite')
      const { DatabaseSync } = await import('node:sqlite')
      if (mode === 'status-mismatch') {
        const db = new DatabaseSync(historyPath)
        db.prepare('UPDATE change_sets SET status = ? WHERE id = ?').run('rejected', proposed.id)
        db.close()
      } else if (mode === 'missing-file') {
        await rm(path)
      } else if (mode === 'moved-file') {
        await rename(path, join(dir, 'manuscript', 'moved.md'))
      } else if (mode === 'external-drift') {
        await writeFile(path, chapter('chapter-one', 'One', '完全不同的外部版本'))
      } else if (mode === 'corrupt-payload-id' || mode === 'corrupt-payload-hash') {
        const db = new DatabaseSync(historyPath)
        const corrupted = mode === 'corrupt-payload-id'
          ? chapter('other-asset', 'Other', '白港放晴')
          : chapter('chapter-one', 'One', '有效身份但错误摘要')
        db.prepare('UPDATE apply_journal SET after_utf8 = ? WHERE change_set_id = ?')
          .run(Buffer.from(corrupted), proposed.id)
        db.close()
      }

      const restarted = await boot(dir)
      const restartedProject = await project(restarted)
      const originalWrite = restarted.fs.writeText.bind(restarted.fs)
      if (mode === 'stale-recovery-write') {
        restarted.fs.writeText = () => Promise.reject(new FsError('stale', 'FS_STALE_VERSION'))
      } else if (mode === 'failed-recovery-write') {
        restarted.fs.writeText = () => Promise.reject(new Error('recovery storage offline'))
      } else if (mode === 'non-stale-fs-recovery-write') {
        restarted.fs.writeText = () => Promise.reject(new FsError('denied', 'FS_IO_ERROR'))
      }
      return { restarted, restartedProject, proposed, originalWrite }
    }

    for (const mode of ['missing-file', 'moved-file', 'external-drift', 'stale-recovery-write'] as const) {
      const state = await interrupted(mode)
      await state.restarted.novelRepository.listAssets(state.restartedProject)
      await expect(state.restarted.novelRepository.readChangeSet(state.restartedProject, state.proposed.id))
        .resolves.toMatchObject({ status: 'conflicted' })
      state.restarted.fs.writeText = state.originalWrite
    }
    for (const mode of ['status-mismatch', 'corrupt-payload-id', 'corrupt-payload-hash'] as const) {
      const state = await interrupted(mode)
      await expect(state.restarted.novelRepository.listAssets(state.restartedProject))
        .rejects.toMatchObject({ code: 'NOVEL_HISTORY_CORRUPT' })
    }
    const offline = await interrupted('failed-recovery-write')
    await expect(offline.restarted.novelRepository.listAssets(offline.restartedProject))
      .rejects.toThrow('recovery storage offline')
    offline.restarted.fs.writeText = offline.originalWrite

    const denied = await interrupted('non-stale-fs-recovery-write')
    await expect(denied.restarted.novelRepository.listAssets(denied.restartedProject))
      .rejects.toMatchObject({ code: 'FS_IO_ERROR' })
    denied.restarted.fs.writeText = denied.originalWrite
  })
})

describe('chapter parsing and UTF-16 guards', () => {
  it('accepts an empty body and covers ordinary, paired, and unpaired surrogate forms', () => {
    expect(parseChapter(new TextEncoder().encode(chapter('chapter-one', 'One', '').trimEnd()), 'chapter.md'))
      .toMatchObject({ id: 'chapter-one', title: 'One', content: { kind: 'manuscript', body: '' } })
    expect(splitsSurrogatePair('A😀B', 0)).toBe(false)
    expect(splitsSurrogatePair('A😀B', 2)).toBe(true)
    expect(splitsSurrogatePair('A😀B', 4)).toBe(false)
    expect(containsUnpairedSurrogate('ordinary')).toBe(false)
    expect(containsUnpairedSurrogate('😀')).toBe(false)
    expect(containsUnpairedSurrogate('\uD83D')).toBe(true)
    expect(containsUnpairedSurrogate('\uD83DX')).toBe(true)
    expect(containsUnpairedSurrogate('\uDE00')).toBe(true)
  })

  it('rejects every unsupported chapter serialization family', () => {
    const invalidUtf8 = new Uint8Array([0xff])
    const cases: Array<[Uint8Array, string]> = [
      [new TextEncoder().encode('---\0\n'), 'NOVEL_ASSET_INVALID'],
      [invalidUtf8, 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode('plain markdown'), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode('---\nnovel:\n  schema: 1'), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode('---\nnovel: [unclosed\n---\n'), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode('---\nnovel: !include value\n---\n'), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode('---\nbase: &base { schema: 1 }\nnovel: *base\n---\n'), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode('---\n- value\n---\n'), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode('---\nnovel: value\n---\n'), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode('---\nextra: ["bad\\0value"]\nnovel: {}\n---\n'), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode(chapter('chapter-one', 'One', '').replace('schema: 1', 'schema: 2')), 'NOVEL_PROJECT_SCHEMA_UNSUPPORTED'],
      [new TextEncoder().encode(chapter('chapter-one', 'One', '').replace('schema: 1', 'schema: "1"')), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode(chapter('chapter-one', 'One', '').replace('type: manuscript.chapter', 'type: idea.card')), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode(chapter('chapter-one', 'One', '').replace('id: chapter-one', 'id: "  "')), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode(chapter('chapter-one', 'One', '').replace('id: chapter-one', 'id: " chapter-one"')), 'NOVEL_ASSET_INVALID'],
      [new TextEncoder().encode(chapter('chapter-one', 'One', '').replace('title: One', 'title: "  "')), 'NOVEL_ASSET_INVALID'],
    ]
    for (const [bytes, code] of cases) {
      expect(() => parseChapter(bytes, 'chapter.md')).toThrow(expect.objectContaining({ code }))
    }
  })
})

describe('project manifest parsing', () => {
  it('rejects malformed YAML, aliases, non-mappings, wrong kind, and invalid schema forms', () => {
    for (const [text, code] of [
      ['kind: [unclosed', 'NOVEL_PROJECT_MANIFEST_INVALID'],
      ['value: &shared [one]\nalias: *shared\n', 'NOVEL_PROJECT_MANIFEST_INVALID'],
      ['- novel-project\n', 'NOVEL_PROJECT_MANIFEST_INVALID'],
      [manifest().replace('kind: novel-project', 'kind: other'), 'NOVEL_PROJECT_MANIFEST_INVALID'],
      [manifest().replace('schema: 1', 'schema: "1"'), 'NOVEL_PROJECT_MANIFEST_INVALID'],
      [manifest().replace('schema: 1', 'schema: 2'), 'NOVEL_PROJECT_SCHEMA_UNSUPPORTED'],
    ] as const) {
      expect(() => parseProjectManifest(text, '/story/novel.yaml')).toThrow(expect.objectContaining({ code }))
    }
  })

  it('rejects YAML warnings instead of discarding unsupported syntax', () => {
    for (const text of [
      manifest().replace('id: project-white-harbor', 'id: !include project-white-harbor'),
      `%YAML 1.3\n---\n${manifest()}`,
    ]) {
      expect(() => parseProjectManifest(text, '/story/novel.yaml'))
        .toThrow(expect.objectContaining({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' }))
    }
  })

  it('rejects duplicate keys and invalid identity, title, and content-root fields', () => {
    for (const text of [
      `${manifest()}kind: novel-project\n`,
      manifest().replace('id: project-white-harbor', 'id: "  "'),
      manifest().replace('id: project-white-harbor', 'id: " project"'),
      manifest().replace('id: project-white-harbor', 'id: "project\\0id"'),
      manifest().replace('title: White Harbor', 'title: "  "'),
      manifest().replace('title: White Harbor', 'title: "White\\nHarbor"'),
      manifest().replace('contentRoots:\n  manuscript: manuscript', 'contentRoots: []'),
      manifest().replace('manuscript: manuscript', 'manuscript: 4'),
      manifest().replace('manuscript: manuscript', 'manuscript: "bad\\0path"'),
      manifest(['  Bad_Name: notes']),
      manifest(['  research: ""']),
      `${manifest()}extra: "bad\\0value"\n`,
      `${manifest()}"bad\\0key": value\n`,
      `${manifest()}extra:\n  - "bad\\0array-value"\n`,
    ]) {
      expect(() => parseProjectManifest(text, '/story/novel.yaml'))
        .toThrow(expect.objectContaining({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' }))
    }
  })

  it('bounds the complete content-root catalog', () => {
    const roots = Array.from({ length: 31 }, (_, index) => `  root-${String(index)}: root-${String(index)}`)
    expect(parseProjectManifest(manifest(roots), '/story/novel.yaml').contentRoots)
      .toHaveProperty('root-30', 'root-30')

    expect(() => parseProjectManifest(
      manifest([...roots, '  root-31: root-31']),
      '/story/novel.yaml',
    )).toThrow(expect.objectContaining({ code: 'NOVEL_PROJECT_MANIFEST_INVALID' }))
  })
})
