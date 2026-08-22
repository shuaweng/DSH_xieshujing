import { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { AssetId, ProjectId, RevisionId } from '@deepseek-ai/dsh-experimental-novel-repository'
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import LocalNovelRepository from '../src/index.ts'
import { containsUnpairedSurrogate, parseChapter, splitsSurrogatePair } from '../src/content.ts'
import { NOVEL_HISTORY_APPLICATION_ID, openHistory } from '../src/history.ts'
import { parseProjectManifest } from '../src/manifest.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-novel-repository-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function boot(dir: string, config: ConstructorParameters<typeof LocalNovelRepository>[1] = {}): Promise<Context> {
  const ctx = new Context()
  const fsFiber = ctx.plugin(LocalFileSystem, { cwd: dir })
  await fsFiber
  const repositoryFiber = ctx.plugin(LocalNovelRepository, config)
  await repositoryFiber
  cleanups.push(async () => { await fsFiber.dispose() })
  cleanups.push(async () => { await repositoryFiber.dispose() })
  return ctx
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
    const defaultRepository = new LocalNovelRepository(direct)
    expect(defaultRepository.manifestMaxBytes).toBe(64 * 1024)
    await direct.fiber.dispose()

    for (const manifestMaxBytes of [0, 1.5, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]) {
      const invalid = new Context()
      const fsFiber = invalid.plugin(LocalFileSystem, { cwd: dir })
      await fsFiber
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
    expect(snapshot.body).toBe('白港\r\n下雨了。')
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
    expect((await ctx.novelRepository.readAsset(novel, current!.asset.id)).body).toBe('外部编辑后的正文')
    const retained = await ctx.novelRepository.readAsset(novel, initial!.asset.id, initial!.revisionId)
    expect(Buffer.from(retained.serializedUtf8).toString('utf8')).toBe(before)
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

  it('guardedly saves only the body and rejects stale writes after external changes', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'manuscript'))
    await writeFile(join(dir, 'novel.yaml'), manifest())
    const path = join(dir, 'manuscript', 'chapter.md')
    await writeFile(path, chapter('chapter-one', '第一章', '原稿'))
    const ctx = await boot(dir)
    const novel = await project(ctx)
    const [initial] = await ctx.novelRepository.listAssets(novel)
    const saved = await ctx.novelRepository.saveChapterBody(novel, {
      assetId: initial!.asset.id,
      baseRevisionId: initial!.revisionId,
      body: '作者新稿',
    })
    expect(saved.body).toBe('作者新稿')
    expect(await readFile(path, 'utf8')).toBe(chapter('chapter-one', '第一章', '作者新稿'))

    await writeFile(path, chapter('chapter-one', '第一章', '编辑器外部新稿'))
    await expect(ctx.novelRepository.saveChapterBody(novel, {
      assetId: initial!.asset.id,
      baseRevisionId: saved.revisionId,
      body: '不应覆盖',
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
      startUtf16: 1,
      endUtf16: 5,
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
      startUtf16: 2,
      endUtf16: 5,
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
    await expect(ctx.novelRepository.saveChapterBody(novel, {
      assetId: AssetId('missing'),
      baseRevisionId: RevisionId('missing'),
      body: 'body',
    })).rejects.toMatchObject({ code: 'NOVEL_ASSET_NOT_FOUND' })
    await expect(ctx.novelRepository.saveChapterBody(novel, {
      assetId: assets[0]!.asset.id,
      baseRevisionId: assets[0]!.revisionId,
      body: '\uD83D',
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
    await expect(bytesCtx.novelRepository.saveChapterBody(bytesProject, {
      assetId: asset!.asset.id,
      baseRevisionId: asset!.revisionId,
      body: 'this body is deliberately much larger than the original',
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
        ...range,
      })).rejects.toMatchObject({ code: 'NOVEL_SELECTION_INVALID' })
    }
    await expect(bytesCtx.novelRepository.captureSelection(bytesProject, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      startUtf16: 0,
      endUtf16: 1,
    })).resolves.toMatchObject({ preview: 'A', selector: { suffix: '😀B' } })
    await expect(bytesCtx.novelRepository.captureSelection(bytesProject, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      startUtf16: 3,
      endUtf16: 4,
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
    const [asset] = await ctx.novelRepository.listAssets(novel)
    const original = ctx.fs.writeText.bind(ctx.fs)
    ctx.fs.writeText = () => Promise.reject(new Error('disk offline'))
    await expect(ctx.novelRepository.saveChapterBody(novel, {
      assetId: asset!.asset.id,
      baseRevisionId: asset!.revisionId,
      body: 'new',
    })).rejects.toThrow('disk offline')
    ctx.fs.writeText = () => Promise.reject(new FsError('stale', 'FS_STALE_VERSION'))
    await expect(ctx.novelRepository.saveChapterBody(novel, {
      assetId: asset!.asset.id,
      baseRevisionId: asset!.revisionId,
      body: 'new',
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
    const history = await openHistory(join(dir, 'history.sqlite'), 100)
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
    const reopened = await openHistory(join(dir, 'history.sqlite'), 100)
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
      startUtf16: 1,
      endUtf16: 3,
    })).resolves.toMatchObject({ preview: '…' })
    await expect(ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      startUtf16: 3,
      endUtf16: 4,
    })).resolves.toMatchObject({ selector: { startUtf16: 3, endUtf16: 4 } })
    const leading = await ctx.novelRepository.captureSelection(novel, {
      assetId: asset!.asset.id,
      revisionId: asset!.revisionId,
      startUtf16: 0,
      endUtf16: 1,
    })
    expect(leading.selector.suffix).toBeUndefined()
  })
})

describe('chapter parsing and UTF-16 guards', () => {
  it('accepts an empty body and covers ordinary, paired, and unpaired surrogate forms', () => {
    expect(parseChapter(new TextEncoder().encode(chapter('chapter-one', 'One', '').trimEnd()), 'chapter.md'))
      .toMatchObject({ id: 'chapter-one', title: 'One', body: '' })
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
