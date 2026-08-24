import { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { describe, expect, it } from 'vitest'
import NovelRepository, {
  AssetId,
  ChangeSetId,
  NovelRepositoryError,
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
} from '../src/index.ts'
import NovelAssetTypeRegistry, { type NovelAssetTypeDefinition } from '../src/asset-types.ts'

class StubNovelRepository extends NovelRepository {
  override discoverProject(_root: FsTarget): Promise<NovelProjectSnapshot | undefined> {
    return Promise.resolve(undefined)
  }

  override listAssets(): Promise<readonly AssetSummary[]> {
    return Promise.resolve([])
  }

  override createAsset(
    _project: NovelProjectSnapshot,
    _request: CreateAssetRequest,
  ): Promise<AssetSnapshot> {
    return Promise.reject(new Error('not configured'))
  }

  override readAsset(): Promise<AssetSnapshot> {
    return Promise.reject(new Error('not configured'))
  }

  override saveAssetContent(
    _project: NovelProjectSnapshot,
    _request: SaveAssetContentRequest,
  ): Promise<AssetSnapshot> {
    return Promise.reject(new Error('not configured'))
  }

  override captureSelection<Input extends NovelSelectionInput>(
    _project: NovelProjectSnapshot,
    _request: CaptureSelectionRequest<Input>,
  ): Promise<SelectionRef<Input>> {
    return Promise.reject(new Error('not configured'))
  }

  override proposeChangeSet(
    _project: NovelProjectSnapshot,
    _request: ProposeChangeSetRequest,
  ): Promise<ChangeSet> {
    return Promise.reject(new Error('not configured'))
  }

  override readChangeSet(): Promise<ChangeSet> {
    return Promise.reject(new Error('not configured'))
  }

  override applyChangeSet(
    _project: NovelProjectSnapshot,
    _changeSetId: ReturnType<typeof ChangeSetId>,
    _authorization: ChangeSetAuthorization,
  ): Promise<ChangeSet> {
    return Promise.reject(new Error('not configured'))
  }

  override rejectChangeSet(
    _project: NovelProjectSnapshot,
    _changeSetId: ReturnType<typeof ChangeSetId>,
    _authorization: ChangeSetAuthorization,
  ): Promise<ChangeSet> {
    return Promise.reject(new Error('not configured'))
  }
}

describe('NovelRepository service definition', () => {
  it('publishes one provider under ctx.novelRepository and releases it with the fiber', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(StubNovelRepository)
    await fiber

    const root = { targetKey: 'root' as FsTarget['targetKey'], displayPath: '/story' }
    await expect(ctx.novelRepository.discoverProject(root)).resolves.toBeUndefined()

    await fiber.dispose()
    expect(ctx.get('novelRepository')).toBeUndefined()
  })

  it('brands provider-validated ids and preserves structured error causes', () => {
    expect(ProjectId('project-1')).toBe('project-1')
    expect(AssetId('chapter-1')).toBe('chapter-1')
    expect(RevisionId('revision-1')).toBe('revision-1')
    expect(SelectionRefId('selection-1')).toBe('selection-1')
    expect(ChangeSetId('changeset-1')).toBe('changeset-1')
    const cause = new Error('broken yaml')
    const error = new NovelRepositoryError(
      'manifest is invalid',
      'NOVEL_PROJECT_MANIFEST_INVALID',
      { cause },
    )
    expect(error.code).toBe('NOVEL_PROJECT_MANIFEST_INVALID')
    expect(error.cause).toBe(cause)
  })

  it('rejects a second provider for the same capability seam', async () => {
    const ctx = new Context()
    await ctx.plugin(StubNovelRepository)
    await expect(ctx.plugin(StubNovelRepository)).rejects.toThrow(/registered/)
  })
})

describe('NovelAssetTypeRegistry', () => {
  const definition = {
    type: 'manuscript.chapter',
    contentRoot: 'manuscript',
    extensions: ['.md'],
    model: {
      description: 'chapter',
      creationInstructions: 'create one chapter',
      proposalInstructions: 'replace selected text',
    },
    parse: () => { throw new Error('unused') },
    create: () => { throw new Error('unused') },
    serializeContent: () => { throw new Error('unused') },
    captureSelection: () => { throw new Error('unused') },
    modelText: () => 'unused',
    prepareOperations: () => [],
    decodeOperations: () => [],
    materializeOperations: () => { throw new Error('unused') },
  } satisfies NovelAssetTypeDefinition

  it('owns exact type contributions for their caller fiber lifetime', async () => {
    const ctx = new Context()
    const registryFiber = ctx.plugin(NovelAssetTypeRegistry)
    await registryFiber
    const first = ctx.plugin({
      inject: ['novelAssetTypes'],
      apply(scope: Context) { scope.novelAssetTypes.register(definition) },
    })
    await first
    const secondDefinition = { ...definition, type: 'bible.test', contentRoot: 'bible' } as never
    const second = ctx.plugin({
      inject: ['novelAssetTypes'],
      apply(scope: Context) { scope.novelAssetTypes.register(secondDefinition) },
    })
    await second

    expect(ctx.novelAssetTypes.list().map(value => value.type)).toEqual(['bible.test', 'manuscript.chapter'])
    expect(ctx.novelAssetTypes.get('bible.test')).toBe(secondDefinition)
    await expect(ctx.plugin({
      inject: ['novelAssetTypes'],
      apply(scope: Context) { scope.novelAssetTypes.register(definition) },
    })).rejects.toThrow(/already registered/u)

    await second.dispose()
    expect(() => ctx.novelAssetTypes.get('bible.test')).toThrow(/no registered Host definition/u)
    expect(ctx.novelAssetTypes.get('manuscript.chapter')).toBe(definition)
    await first.dispose()
    await registryFiber.dispose()
  })

  it('rejects ambiguous or incomplete registrations', async () => {
    const ctx = new Context()
    await ctx.plugin(NovelAssetTypeRegistry)
    for (const invalid of [
      { ...definition, type: 'Chapter' },
      { ...definition, extensions: [] },
      { ...definition, requiredContentRoot: 'yes' },
      { ...definition, model: { description: '', proposalInstructions: 'x' } },
      { ...definition, parse: undefined },
    ]) {
      expect(() => ctx.novelAssetTypes.register(invalid as never)).toThrow()
    }
  })

  it('allows read-and-edit types to opt out of direct creation', async () => {
    const ctx = new Context()
    await ctx.plugin(NovelAssetTypeRegistry)
    const { create: _create, ...withoutCreate } = definition
    const readOnlyCreation = {
      ...withoutCreate,
      model: {
        description: definition.model.description,
        proposalInstructions: definition.model.proposalInstructions,
      },
    } satisfies NovelAssetTypeDefinition
    ctx.novelAssetTypes.register(readOnlyCreation)
    expect(ctx.novelAssetTypes.get('manuscript.chapter').create === undefined).toBe(true)
  })
})
