import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import NovelRepository, {
  ProjectId,
  type NovelProjectSnapshot,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import { describe, expect, it, vi } from 'vitest'
import NovelRepositoryRemote from '../src/index.ts'

class StubNovelRepository extends NovelRepository {
  project: NovelProjectSnapshot | undefined

  override discoverProject(_root: FsTarget): Promise<NovelProjectSnapshot | undefined> {
    return Promise.resolve(this.project)
  }
}

function testAgent(cwd?: string): Agent {
  return {
    id: 'agent-1',
    session: { header: cwd === undefined ? {} : { cwd } },
  } as unknown as Agent
}

describe('NovelRepositoryRemote Host service', () => {
  it('projects display-only project values and releases only its Consumer service', async () => {
    const ctx = new Context()
    const root = { targetKey: 'root', displayPath: '/story' } as FsTarget
    const manifest = { targetKey: 'manifest', displayPath: '/story/novel.yaml' } as FsTarget
    const chapters = { targetKey: 'chapters', displayPath: '/story/manuscript' } as FsTarget
    const resolve = vi.fn<FileSystem['resolve']>().mockResolvedValue(root)
    const disposeFs = ctx.provide('fs', { resolve } as unknown as FileSystem)
    const repositoryFiber = ctx.plugin(StubNovelRepository)
    await repositoryFiber
    const repository = ctx.novelRepository as StubNovelRepository
    repository.project = {
      schema: 1,
      id: ProjectId('project-1'),
      title: 'White Harbor',
      root,
      manifest,
      contentRoots: { manuscript: chapters },
    }
    const remoteFiber = ctx.plugin(NovelRepositoryRemote)
    await remoteFiber
    const controller = new AbortController()

    await expect(ctx.novelRepositoryRemote.discover(testAgent('/story'), controller.signal))
      .resolves.toEqual({
        schema: 1,
        id: 'project-1',
        title: 'White Harbor',
        rootDisplayPath: '/story',
        manifestDisplayPath: '/story/novel.yaml',
        contentRootDisplayPaths: { manuscript: '/story/manuscript' },
      })
    expect(resolve).toHaveBeenCalledWith('/story', { signal: controller.signal })
    expect(ctx.novelRepositoryRemote.typertRemote).toMatchObject({
      serviceKey: 'novelRepositoryRemote',
      namespace: 'novelRepository',
    })

    await remoteFiber.dispose()
    expect(ctx.get('novelRepositoryRemote')).toBeUndefined()
    expect(ctx.get('novelRepository')).toBeInstanceOf(StubNovelRepository)
    await repositoryFiber.dispose()
    disposeFs()
  })

  it('rejects discovery when the addressed Session has no working directory', async () => {
    const ctx = new Context()
    const disposeFs = ctx.provide('fs', {
      resolve: vi.fn<FileSystem['resolve']>(),
    } as unknown as FileSystem)
    const repositoryFiber = ctx.plugin(StubNovelRepository)
    await repositoryFiber
    const remoteFiber = ctx.plugin(NovelRepositoryRemote)
    await remoteFiber

    await expect(ctx.novelRepositoryRemote.discover(testAgent(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_ROOT_INVALID' })

    await remoteFiber.dispose()
    await repositoryFiber.dispose()
    disposeFs()
  })

  it('preserves the repository absence result without inventing a descriptor', async () => {
    const ctx = new Context()
    const root = { targetKey: 'root', displayPath: '/plain-workspace' } as FsTarget
    const disposeFs = ctx.provide('fs', {
      resolve: vi.fn<FileSystem['resolve']>().mockResolvedValue(root),
    } as unknown as FileSystem)
    const repositoryFiber = ctx.plugin(StubNovelRepository)
    await repositoryFiber
    const remoteFiber = ctx.plugin(NovelRepositoryRemote)
    await remoteFiber

    await expect(ctx.novelRepositoryRemote.discover(
      testAgent('/plain-workspace'),
      new AbortController().signal,
    )).resolves.toBeUndefined()

    await remoteFiber.dispose()
    await repositoryFiber.dispose()
    disposeFs()
  })

  it('bounds the complete UTF-8 project descriptor and validates its configured cap', async () => {
    const root = { targetKey: 'root', displayPath: '/故事' } as FsTarget
    const manifest = { targetKey: 'manifest', displayPath: '/故事/novel.yaml' } as FsTarget
    const chapters = { targetKey: 'chapters', displayPath: '/故事/正文' } as FsTarget
    const expected = {
      schema: 1,
      id: 'project-1',
      title: '白港',
      rootDisplayPath: '/故事',
      manifestDisplayPath: '/故事/novel.yaml',
      contentRootDisplayPaths: { manuscript: '/故事/正文' },
    }
    const exactBytes = new TextEncoder().encode(JSON.stringify(expected)).byteLength

    async function discover(descriptorMaxBytes: number): Promise<unknown> {
      const ctx = new Context()
      const disposeFs = ctx.provide('fs', {
        resolve: vi.fn<FileSystem['resolve']>().mockResolvedValue(root),
      } as unknown as FileSystem)
      const repositoryFiber = ctx.plugin(StubNovelRepository)
      await repositoryFiber
      const repository = ctx.novelRepository as StubNovelRepository
      repository.project = {
        schema: 1,
        id: ProjectId('project-1'),
        title: '白港',
        root,
        manifest,
        contentRoots: { manuscript: chapters },
      }
      const remoteFiber = ctx.plugin(NovelRepositoryRemote, { descriptorMaxBytes })
      await remoteFiber
      try {
        return await ctx.novelRepositoryRemote.discover(
          testAgent('/故事'),
          new AbortController().signal,
        )
      } finally {
        await remoteFiber.dispose()
        await repositoryFiber.dispose()
        disposeFs()
      }
    }

    await expect(discover(exactBytes)).resolves.toEqual(expected)
    await expect(discover(exactBytes - 1))
      .rejects.toMatchObject({ code: 'NOVEL_PROJECT_DESCRIPTOR_TOO_LARGE' })

    const defaultContext = new Context()
    expect(new NovelRepositoryRemote(defaultContext)).toBeInstanceOf(NovelRepositoryRemote)
    await defaultContext.fiber.dispose()

    for (const descriptorMaxBytes of [0, 1.5, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]) {
      const ctx = new Context()
      expect(() => new NovelRepositoryRemote(ctx, { descriptorMaxBytes }))
        .toThrow(/integer between 1 and/)
      await ctx.fiber.dispose()
    }
  })
})
