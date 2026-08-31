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
  type AssetSearchResult,
  type AssetRevisionSummary,
  type CaptureSelectionRequest,
  type ChangeSet,
  type ChangeSetAuthorization,
  type CreateAssetRequest,
  type NovelProjectSnapshot,
  type InitializeNovelProjectRequest,
  type NovelAnalysisReport,
  type NovelSelectionInput,
  type PutNovelAnalysisReportRequest,
  type ProposeChangeSetRequest,
  type ReorderAssetsRequest,
  type RestoreAssetRevisionRequest,
  type RestoreAssetRevisionResult,
  type SaveAssetContentRequest,
  type SearchAssetsRequest,
  type SelectionRef,
  type TextRangeSelector,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import { FsTargetKey, type FileSystem, type FsTarget } from '@deepseek-ai/dsh-fs'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import NovelRepositoryRemote from '../src/index.ts'
import type { NovelContextWorksetDescriptor } from '../src/types.ts'

class StubNovelRepository extends NovelRepository {
  project: NovelProjectSnapshot | undefined
  assets: readonly AssetSummary[] = []
  searchResults: readonly AssetSearchResult[] = []
  searches: SearchAssetsRequest[] = []
  snapshot: AssetSnapshot | undefined
  selection: SelectionRef | undefined
  changeSetValue: ChangeSet | undefined
  authorizations: ChangeSetAuthorization[] = []
  creations: CreateAssetRequest[] = []
  revisions: readonly AssetRevisionSummary[] = []
  reports: readonly NovelAnalysisReport[] = []
  initializations: InitializeNovelProjectRequest[] = []
  reorders: ReorderAssetsRequest[] = []
  restores: RestoreAssetRevisionRequest[] = []
  restoreResult: RestoreAssetRevisionResult | undefined

  override discoverProject(_root: FsTarget): Promise<NovelProjectSnapshot | undefined> {
    return Promise.resolve(this.project)
  }

  override initializeProject(root: FsTarget, request: InitializeNovelProjectRequest): Promise<NovelProjectSnapshot> {
    this.initializations.push(request)
    const project: NovelProjectSnapshot = {
      schema: 1,
      id: ProjectId('project-initialized'),
      title: request.title.trim(),
      ...(request.description === undefined ? {} : { description: request.description.trim() }),
      root,
      manifest: { targetKey: FsTargetKey('manifest'), displayPath: `${root.displayPath}/novel.yaml` },
      contentRoots: {
        manuscript: { targetKey: FsTargetKey('manuscript'), displayPath: `${root.displayPath}/manuscript` },
        planning: { targetKey: FsTargetKey('planning'), displayPath: `${root.displayPath}/planning` },
      },
      assetOrder: {},
    }
    this.project = project
    return Promise.resolve(project)
  }

  override listAssets(): Promise<readonly AssetSummary[]> {
    return Promise.resolve(this.assets)
  }

  override reorderAssets(
    _project: NovelProjectSnapshot,
    request: ReorderAssetsRequest,
  ): Promise<readonly AssetSummary[]> {
    this.reorders.push(request)
    return Promise.resolve(this.assets)
  }

  override searchAssets(
    _project: NovelProjectSnapshot,
    request: SearchAssetsRequest,
  ): Promise<readonly AssetSearchResult[]> {
    this.searches.push(request)
    return Promise.resolve(this.searchResults)
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

  override listAssetRevisions(): Promise<readonly AssetRevisionSummary[]> {
    return Promise.resolve(this.revisions)
  }

  override restoreAssetRevision(
    _project: NovelProjectSnapshot,
    request: RestoreAssetRevisionRequest,
  ): Promise<RestoreAssetRevisionResult> {
    if (this.restoreResult === undefined) throw new Error('restore result not configured')
    this.restores.push(request)
    return Promise.resolve(this.restoreResult)
  }

  override listAnalysisReports(): Promise<readonly NovelAnalysisReport[]> {
    return Promise.resolve(this.reports)
  }

  override putAnalysisReport(
    project: NovelProjectSnapshot,
    request: PutNovelAnalysisReportRequest,
  ): Promise<NovelAnalysisReport> {
    return Promise.resolve({ projectId: project.id, ...request })
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
  ctx.provide('novelAnalysis', {
    scanChapter: vi.fn(),
    reviewChapter: vi.fn(),
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
      description: 'A detective returns to a harbor that remembers too much.',
      root,
      manifest,
      contentRoots: { manuscript: chapters },
      assetOrder: {},
    }
    const remoteFiber = ctx.plugin(NovelRepositoryRemote)
    await remoteFiber
    const controller = new AbortController()

    await expect(ctx.novelRepositoryRemote.discover(testAgent('/story'), controller.signal))
      .resolves.toEqual({
        schema: 1,
        id: 'project-1',
        title: 'White Harbor',
        description: 'A detective returns to a harbor that remembers too much.',
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

  it('initializes exactly the addressed Session root and is idempotent once discovered', async () => {
    const ctx = testContext()
    const root = { targetKey: 'root', displayPath: '/new-book' } as FsTarget
    const resolve = vi.fn<FileSystem['resolve']>().mockResolvedValue(root)
    const disposeFs = ctx.provide('fs', { resolve } as unknown as FileSystem)
    const repositoryFiber = ctx.plugin(StubNovelRepository)
    await repositoryFiber
    const repository = ctx.novelRepository as StubNovelRepository
    const remoteFiber = ctx.plugin(NovelRepositoryRemote)
    await remoteFiber

    const agent = testAgent('/new-book')
    await expect(ctx.novelRepositoryRemote.initialize(agent, {
      title: '  国运擂台  ',
      description: '  神明擂台降临。  ',
    }, new AbortController().signal))
      .resolves.toMatchObject({
        id: 'project-initialized', title: '国运擂台', description: '神明擂台降临。', rootDisplayPath: '/new-book',
      })
    await expect(ctx.novelRepositoryRemote.initialize(agent, { title: '忽略此标题' }, new AbortController().signal))
      .resolves.toMatchObject({ id: 'project-initialized', title: '国运擂台' })
    expect(repository.initializations).toEqual([{ title: '  国运擂台  ', description: '  神明擂台降临。  ' }])
    expect(resolve).toHaveBeenCalledWith('/new-book', expect.any(Object))

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
      assetOrder: {},
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
    repository.searchResults = [{ summary: repository.assets[0]!, excerpt: '旧正文', score: 500 }]
    repository.revisions = [{
      id: snapshot.revisionId,
      projectId: snapshot.asset.projectId,
      assetId: snapshot.asset.id,
      contentHash: snapshot.contentHash,
      origin: 'agent-apply',
      createdAt: '2026-08-25T08:00:00.000Z',
      generation: {
        sessionId: SessionId('agent-1'),
        strategy: 'direct',
      },
    }]
    repository.restoreResult = {
      snapshot: { ...snapshot, revisionId: RevisionId('revision-restored') },
      conflictedChangeSetCount: 2,
      storyStateReviewRecommended: true,
    }
    const noAiReport: NovelAnalysisReport = {
      projectId: snapshot.asset.projectId,
      assetId: snapshot.asset.id,
      revisionId: snapshot.revisionId,
      kind: 'noai-scan',
      analyzerVersion: 'noai-rules/1',
      generatedAt: '2026-08-25T09:00:00.000Z',
      data: { riskScore: 42 },
      sourceSessionId: 'agent-1' as never,
    }
    repository.reports = [noAiReport]
    const analysis = ctx.novelAnalysis as unknown as {
      scanChapter: ReturnType<typeof vi.fn>
      reviewChapter: ReturnType<typeof vi.fn>
    }
    analysis.scanChapter.mockResolvedValue(noAiReport)
    const reviewReport: NovelAnalysisReport = {
      ...noAiReport,
      kind: 'chapter-review',
      analyzerVersion: 'chapter-review/1',
      data: { overallScore: 75 },
      workerSessionId: 'worker-1' as never,
    }
    analysis.reviewChapter.mockResolvedValue(reviewReport)
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
    await expect(ctx.novelRepositoryRemote.reorderAssets(agent, {
      type: 'manuscript.chapter', orderedAssetIds: [AssetId('chapter-1')],
    }, signal)).resolves.toEqual([{
      id: 'chapter-1', projectId: 'project-1', type: 'manuscript.chapter',
      projectRelativePath: 'manuscript/chapter-1.md', revisionId: 'revision-1',
      contentHash: snapshot.contentHash, title: '第一章',
    }])
    expect(repository.reorders).toEqual([{
      type: 'manuscript.chapter', orderedAssetIds: [AssetId('chapter-1')],
    }])
    await expect(ctx.novelRepositoryRemote.search(agent, {
      query: '旧', types: ['manuscript.chapter'], limit: 3,
    }, signal)).resolves.toEqual([{
      id: 'chapter-1', projectId: 'project-1', type: 'manuscript.chapter',
      projectRelativePath: 'manuscript/chapter-1.md', revisionId: 'revision-1',
      contentHash: snapshot.contentHash, title: '第一章', excerpt: '旧正文', score: 500,
    }])
    expect(repository.searches).toEqual([{ query: '旧', types: ['manuscript.chapter'], limit: 3 }])

    const workset: NovelContextWorksetDescriptor = {
      version: 2,
      projectId: ProjectId('project-1'),
      items: [{
        projectId: ProjectId('project-1'), assetId: AssetId('chapter-1'),
        label: '第一章',
        mode: 'follow', origin: 'active-asset',
      }],
      surface: {
        kind: 'library-home', label: '小说工作台首页', bookCount: 1,
        manuscriptCharacters: 1200, todayCharacterDelta: 300,
        books: [{
          title: '白港', description: '海港悬疑故事。', chapterCount: 1,
          manuscriptCharacters: 1200, continueTitle: '第一章',
        }],
        omittedBooks: 0,
      },
    }
    const replaceWorkset = vi.fn(async () => workset as never)
    const disposeContext = ctx.provide('novelContextResolver', { replaceWorkset } as never)
    await expect(ctx.novelRepositoryRemote.replaceContextWorkset(agent, workset, signal)).resolves.toEqual(workset)
    expect(replaceWorkset).toHaveBeenCalledWith(agent, workset, signal)
    disposeContext()
    await expect(ctx.novelRepositoryRemote.asset(agent, AssetId('chapter-1'), null, signal))
      .resolves.toMatchObject({ title: '第一章', content: { kind: 'manuscript', body: '旧正文' } })
    const revisions = await ctx.novelRepositoryRemote.revisions(agent, AssetId('chapter-1'), signal)
    expect(revisions).toEqual([expect.objectContaining({ id: 'revision-1', origin: 'agent-apply' })])
    expect(revisions[0]).not.toHaveProperty('generation')
    await expect(ctx.novelRepositoryRemote.restoreAsset(agent, {
      assetId: AssetId('chapter-1'),
      baseRevisionId: RevisionId('revision-2'),
      sourceRevisionId: RevisionId('revision-1'),
    }, signal)).resolves.toMatchObject({
      document: { revisionId: 'revision-restored', title: '第一章' },
      conflictedChangeSetCount: 2,
      storyStateReviewRecommended: true,
    })
    expect(repository.restores).toEqual([{
      assetId: 'chapter-1', baseRevisionId: 'revision-2', sourceRevisionId: 'revision-1',
      restoredBySessionId: 'agent-1',
    }])
    await expect(ctx.novelRepositoryRemote.analysisReports(
      agent, AssetId('chapter-1'), RevisionId('revision-1'), signal,
    )).resolves.toEqual([expect.objectContaining({ kind: 'noai-scan', data: { riskScore: 42 } })])
    await expect(ctx.novelRepositoryRemote.scanNoAi(
      agent, AssetId('chapter-1'), RevisionId('revision-1'), signal,
    )).resolves.toMatchObject({ kind: 'noai-scan', sourceSessionId: 'agent-1' })
    await expect(ctx.novelRepositoryRemote.reviewChapter(
      agent, AssetId('chapter-1'), RevisionId('revision-1'), signal,
    )).resolves.toMatchObject({ kind: 'chapter-review', workerSessionId: 'worker-1' })
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
        assetOrder: {},
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
      assetOrder: {},
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
