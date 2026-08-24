import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import NovelRepository, {
  AssetId,
  ChangeSetId,
  ProjectId,
  RevisionId,
  SelectionRefId,
  type AssetSnapshot,
  type AssetSummary,
  type CaptureSelectionRequest,
  type ChangeSet,
  type ChangeSetAuthorization,
  type CreateAssetRequest,
  type NovelProjectSnapshot,
  type NovelSelectionInput,
  type ProposeChangeSetRequest,
  type SaveAssetContentRequest,
  type SelectionRef,
  type TextRangeSelector,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import { describe, expect, it, vi } from 'vitest'
import NovelRepositoryRemote from '../src/index.ts'

class StubNovelRepository extends NovelRepository {
  project: NovelProjectSnapshot | undefined
  assets: readonly AssetSummary[] = []
  snapshot: AssetSnapshot | undefined
  selection: SelectionRef | undefined
  changeSetValue: ChangeSet | undefined
  authorizations: ChangeSetAuthorization[] = []
  creations: CreateAssetRequest[] = []

  override discoverProject(_root: FsTarget): Promise<NovelProjectSnapshot | undefined> {
    return Promise.resolve(this.project)
  }

  override listAssets(): Promise<readonly AssetSummary[]> {
    return Promise.resolve(this.assets)
  }

  override createAsset(
    _project: NovelProjectSnapshot,
    request: CreateAssetRequest,
  ): Promise<AssetSnapshot> {
    if (this.snapshot === undefined) throw new Error('snapshot not configured')
    this.creations.push(request)
    return Promise.resolve({
      ...this.snapshot,
      asset: {
        ...this.snapshot.asset,
        type: request.type,
        ...(request.parentId === undefined ? {} : { parentId: request.parentId }),
      },
      content: request.content,
      frontmatter: { novel: { title: request.title } },
    })
  }

  override readAsset(): Promise<AssetSnapshot> {
    if (this.snapshot === undefined) throw new Error('snapshot not configured')
    return Promise.resolve(this.snapshot)
  }

  override saveAssetContent(_project: NovelProjectSnapshot, request: SaveAssetContentRequest): Promise<AssetSnapshot> {
    if (this.snapshot === undefined) throw new Error('snapshot not configured')
    const novel = this.snapshot.frontmatter['novel'] as Record<string, unknown>
    return Promise.resolve({
      ...this.snapshot,
      content: request.content,
      frontmatter: {
        ...this.snapshot.frontmatter,
        novel: { ...novel, ...(request.title === undefined ? {} : { title: request.title }) },
      },
    })
  }

  override captureSelection<Input extends NovelSelectionInput>(
    _project: NovelProjectSnapshot,
    _request: CaptureSelectionRequest<Input>,
  ): Promise<SelectionRef<Input>> {
    if (this.selection === undefined) throw new Error('selection not configured')
    return Promise.resolve(this.selection as unknown as SelectionRef<Input>)
  }

  override proposeChangeSet(
    _project: NovelProjectSnapshot,
    _request: ProposeChangeSetRequest,
  ): Promise<ChangeSet> {
    return Promise.reject(new Error('changeset not configured'))
  }

  override readChangeSet(): Promise<ChangeSet> {
    if (this.changeSetValue === undefined) throw new Error('changeset not configured')
    return Promise.resolve(this.changeSetValue)
  }

  override applyChangeSet(
    _project: NovelProjectSnapshot,
    _changeSetId: ReturnType<typeof ChangeSetId>,
    _authorization: ChangeSetAuthorization,
  ): Promise<ChangeSet> {
    if (this.changeSetValue === undefined) throw new Error('changeset not configured')
    this.authorizations.push(_authorization)
    return Promise.resolve({ ...this.changeSetValue, status: 'applied', resultRevisionId: RevisionId('revision-2') })
  }

  override rejectChangeSet(
    _project: NovelProjectSnapshot,
    _changeSetId: ReturnType<typeof ChangeSetId>,
    _authorization: ChangeSetAuthorization,
  ): Promise<ChangeSet> {
    if (this.changeSetValue === undefined) throw new Error('changeset not configured')
    this.authorizations.push(_authorization)
    return Promise.resolve({ ...this.changeSetValue, status: 'rejected' })
  }
}

function testAgent(cwd?: string): Agent {
  return {
    id: 'agent-1',
    session: { id: 'agent-1', events: [], header: cwd === undefined ? {} : { cwd } },
  } as unknown as Agent
}

function testContext(): Context {
  const ctx = new Context()
  ctx.provide('sandboxPolicy', {
    resolve: ({ session }: { session?: Agent['session'] } = {}) => ({
      mode: 'workspace-write',
      workspaceRoot: session?.header.cwd ?? '/deployment-fallback',
      ...(session === undefined ? {} : { sessionId: session.id }),
    }),
  } as never)
  return ctx
}

describe('NovelRepositoryRemote Host service', () => {
  it('projects display-only project values and releases only its Consumer service', async () => {
    const ctx = testContext()
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
    const ctx = testContext()
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
    const ctx = testContext()
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
    await expect(ctx.novelRepositoryRemote.assets(
      testAgent('/plain-workspace'),
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'NOVEL_PROJECT_ROOT_INVALID' })

    await remoteFiber.dispose()
    await repositoryFiber.dispose()
    disposeFs()
  })

  it('projects chapter catalog, read, guarded save, and frozen selection without filesystem identities', async () => {
    const ctx = testContext()
    const root = { targetKey: 'root', displayPath: '/story' } as FsTarget
    const manifest = { targetKey: 'manifest', displayPath: '/story/novel.yaml' } as FsTarget
    const chapters = { targetKey: 'chapters', displayPath: '/story/manuscript' } as FsTarget
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
    const snapshot: AssetSnapshot = {
      asset: {
        id: AssetId('chapter-1'),
        projectId: ProjectId('project-1'),
        type: 'manuscript.chapter',
        projectRelativePath: 'manuscript/chapter-1.md',
      },
      revisionId: RevisionId('revision-1'),
      serializedUtf8: new TextEncoder().encode('serialized bytes stay Host-only'),
      contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      frontmatter: { novel: { title: '第一章' } },
      content: { kind: 'manuscript', body: '旧正文' },
    }
    repository.snapshot = snapshot
    repository.assets = [{
      asset: snapshot.asset,
      revisionId: snapshot.revisionId,
      contentHash: snapshot.contentHash,
      title: '第一章',
    }]
    const textSelector: TextRangeSelector = {
      kind: 'text-range',
      startUtf16: 0,
      endUtf16: 1,
      quoteHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }
    const selection: SelectionRef = {
      version: 1,
      id: SelectionRefId('selection-1'),
      projectId: ProjectId('project-1'),
      assetId: AssetId('chapter-1'),
      revisionId: RevisionId('revision-1'),
      selector: textSelector,
      preview: '旧',
    }
    repository.selection = selection
    repository.changeSetValue = {
      id: ChangeSetId('changeset-1'),
      projectId: ProjectId('project-1'),
      assetId: AssetId('chapter-1'),
      assetType: 'manuscript.chapter',
      baseRevisionId: RevisionId('revision-1'),
      operations: [{
        kind: 'replace-text',
        selector: textSelector,
        replacement: '新',
      }],
      actor: { kind: 'agent', sessionId: 'agent-1' as ChangeSetAuthorization['sessionId'] },
      summary: '修改首字',
      status: 'proposed',
    }
    const remoteFiber = ctx.plugin(NovelRepositoryRemote)
    await remoteFiber
    const agent = testAgent('/story')
    const signal = new AbortController().signal

    await expect(ctx.novelRepositoryRemote.assets(agent, signal)).resolves.toEqual([{
      id: 'chapter-1',
      projectId: 'project-1',
      type: 'manuscript.chapter',
      projectRelativePath: 'manuscript/chapter-1.md',
      revisionId: 'revision-1',
      contentHash: snapshot.contentHash,
      title: '第一章',
    }])
    await expect(ctx.novelRepositoryRemote.asset(agent, AssetId('chapter-1'), null, signal))
      .resolves.toMatchObject({ title: '第一章', content: { kind: 'manuscript', body: '旧正文' } })
    await expect(ctx.novelRepositoryRemote.createAsset(agent, {
      type: 'manuscript.chapter',
      title: '第二章',
      content: { kind: 'manuscript', body: '新章节' },
    }, signal)).resolves.toMatchObject({ title: '第二章', content: { kind: 'manuscript', body: '新章节' } })
    expect(repository.creations).toEqual([expect.objectContaining({
      type: 'manuscript.chapter', title: '第二章', actor: { kind: 'user', sessionId: 'agent-1' },
    })])
    await expect(ctx.novelRepositoryRemote.saveAsset(agent, {
      assetId: AssetId('chapter-1'),
      baseRevisionId: RevisionId('revision-1'),
      title: '雨夜归人',
      content: { kind: 'manuscript', body: '新正文' },
    }, signal)).resolves.toMatchObject({ title: '雨夜归人', content: { kind: 'manuscript', body: '新正文' } })
    const captured = await ctx.novelRepositoryRemote.captureSelection(agent, {
      assetId: AssetId('chapter-1'),
      revisionId: RevisionId('revision-1'),
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    }, signal)
    expect(captured).toMatchObject({ id: 'selection-1', preview: '旧' })
    expect(captured.mention).toMatch(/^@\[旧\]\(dsh-novel:/u)
    const { preview: _preview, ...selectionWithoutPreview } = selection
    repository.selection = selectionWithoutPreview
    const capturedWithoutPreview = await ctx.novelRepositoryRemote.captureSelection(agent, {
      assetId: AssetId('chapter-1'),
      revisionId: RevisionId('revision-1'),
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    }, signal)
    expect(capturedWithoutPreview.mention).toMatch(/^@\[chapter-1\]\(dsh-novel:/u)
    await expect(ctx.novelRepositoryRemote.changeSet(agent, ChangeSetId('changeset-1'), signal))
      .resolves.toMatchObject({ id: 'changeset-1', status: 'proposed', operations: [{ replacement: '新' }] })
    await expect(ctx.novelRepositoryRemote.applyChangeSet(agent, ChangeSetId('changeset-1'), signal))
      .resolves.toMatchObject({ status: 'applied', resultRevisionId: 'revision-2' })
    await expect(ctx.novelRepositoryRemote.rejectChangeSet(agent, ChangeSetId('changeset-1'), signal))
      .resolves.toMatchObject({ status: 'rejected' })
    expect(repository.authorizations).toEqual([{ sessionId: 'agent-1' }, { sessionId: 'agent-1' }])

    const storedChangeSet = repository.changeSetValue
    if (!storedChangeSet) throw new Error('expected seeded ChangeSet')
    repository.changeSetValue = { ...storedChangeSet, operations: [] }
    await expect(ctx.novelRepositoryRemote.changeSet(agent, ChangeSetId('changeset-1'), signal))
      .resolves.toMatchObject({ operations: [] })
    repository.changeSetValue = {
      ...storedChangeSet,
      operations: [
        { kind: 'replace-text', selector: textSelector, replacement: '一' },
        { kind: 'replace-text', selector: textSelector, replacement: '二' },
      ],
    }
    await expect(ctx.novelRepositoryRemote.changeSet(agent, ChangeSetId('changeset-1'), signal))
      .resolves.toMatchObject({ operations: [{ replacement: '一' }, { replacement: '二' }] })

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
      const ctx = testContext()
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
    for (const responseMaxBytes of [0, 1.5, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]) {
      const ctx = new Context()
      expect(() => new NovelRepositoryRemote(ctx, { responseMaxBytes }))
        .toThrow(/integer between 1 and/)
      await ctx.fiber.dispose()
    }
  })

  it('fails closed when browser responses exceed their bound or retained title metadata is corrupt', async () => {
    const ctx = testContext()
    const root = { targetKey: 'root', displayPath: '/story' } as FsTarget
    const manifest = { targetKey: 'manifest', displayPath: '/story/novel.yaml' } as FsTarget
    const chapters = { targetKey: 'chapters', displayPath: '/story/manuscript' } as FsTarget
    const disposeFs = ctx.provide('fs', {
      resolve: vi.fn<FileSystem['resolve']>().mockResolvedValue(root),
    } as unknown as FileSystem)
    const repositoryFiber = ctx.plugin(StubNovelRepository)
    await repositoryFiber
    const repository = ctx.novelRepository as StubNovelRepository
    repository.project = {
      schema: 1,
      id: ProjectId('project-1'),
      title: 'Story',
      root,
      manifest,
      contentRoots: { manuscript: chapters },
    }
    repository.assets = [{
      asset: {
        id: AssetId('chapter-1'),
        projectId: ProjectId('project-1'),
        type: 'manuscript.chapter',
        projectRelativePath: 'manuscript/chapter-1.md',
      },
      revisionId: RevisionId('revision-1'),
      contentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'A title that exceeds the tiny response budget',
    }]
    const remoteFiber = ctx.plugin(NovelRepositoryRemote, { responseMaxBytes: 1 })
    await remoteFiber
    const agent = testAgent('/story')
    const signal = new AbortController().signal
    await expect(ctx.novelRepositoryRemote.assets(agent, signal))
      .rejects.toMatchObject({ code: 'NOVEL_RESPONSE_TOO_LARGE' })

    repository.snapshot = {
      asset: repository.assets[0]!.asset,
      revisionId: RevisionId('revision-1'),
      serializedUtf8: new Uint8Array(),
      contentHash: repository.assets[0]!.contentHash,
      frontmatter: { novel: [] },
      content: { kind: 'manuscript', body: 'body' },
    }
    await expect(ctx.novelRepositoryRemote.asset(agent, AssetId('chapter-1'), null, signal))
      .rejects.toMatchObject({ code: 'NOVEL_HISTORY_CORRUPT' })

    await remoteFiber.dispose()
    await repositoryFiber.dispose()
    disposeFs()
  })
})
