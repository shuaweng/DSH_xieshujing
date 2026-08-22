import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import LocalNovelRepository from '../src/index.ts'
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

async function boot(dir: string, config: { manifestMaxBytes?: number } = {}): Promise<Context> {
  const ctx = new Context()
  const fsFiber = ctx.plugin(LocalFileSystem, { cwd: dir })
  await fsFiber
  const repositoryFiber = ctx.plugin(LocalNovelRepository, config)
  await repositoryFiber
  cleanups.push(async () => { await fsFiber.dispose() })
  cleanups.push(async () => { await repositoryFiber.dispose() })
  return ctx
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
