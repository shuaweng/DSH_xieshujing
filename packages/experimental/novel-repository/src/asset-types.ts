/** Runtime registry for authored Novel Asset parsing and typed mutations. */

import { Service, type Context } from '@deepseek-ai/cordis'
import { NovelRepositoryError } from './error.ts'
import type {
  AssetSnapshot,
  AssetId,
  CreateAssetRequest,
  NovelAssetContent,
  NovelAssetType,
  NovelOperation,
  NovelSelectionInput,
  NovelSelector,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelAssetTypes: NovelAssetTypeRegistry
  }
}

/** Parsed authored bytes plus type-private serialization state. */
export interface ParsedNovelAsset {
  readonly id: AssetId
  readonly type: NovelAssetType
  readonly parentId?: AssetId
  readonly title: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly content: NovelAssetContent
  readonly source: unknown
}

/** Complete validated candidate serialization returned by one type definition. */
export interface NovelAssetMaterialization {
  readonly serializedUtf8: Uint8Array
  readonly parsed: ParsedNovelAsset
}

/** Bounded diagnostics retained while freezing one semantic selection. */
export interface NovelSelectionCaptureOptions {
  readonly contextUnits: number
  readonly previewUnits: number
}

/** Selection fields computed by a type definition before Repository identity is added. */
export interface CapturedNovelSelection {
  readonly selector: NovelSelector
  readonly preview?: string
}

/** Host behavior contributed by one exact Frontmatter `novel.type`. */
export interface NovelAssetTypeDefinition {
  readonly type: NovelAssetType
  readonly contentRoot: string
  /** Whether every project manifest must declare this type's content root. */
  readonly requiredContentRoot?: boolean
  readonly extensions: readonly string[]
  readonly model: {
    readonly description: string
    /** Present only when this type supports Repository-owned creation. */
    readonly creationInstructions?: string
    readonly proposalInstructions: string
  }
  /** Optional semantic-parent contract enforced after every scan and before creation. */
  readonly parent?: {
    readonly allowedTypes: readonly NovelAssetType[]
    readonly required?: boolean
    readonly singleton?: boolean
    /** Maximum number of parent edges reachable from this Asset. */
    readonly maxDepth?: number
  }
  parse(serializedUtf8: Uint8Array, projectRelativePath: string): ParsedNovelAsset
  create?(
    request: Pick<CreateAssetRequest, 'title' | 'parentId' | 'content'> & { readonly id: AssetId },
    projectRelativePath: string,
  ): NovelAssetMaterialization
  serializeContent(snapshot: AssetSnapshot, content: NovelAssetContent, title?: string): NovelAssetMaterialization
  captureSelection(
    snapshot: AssetSnapshot,
    input: NovelSelectionInput,
    options: NovelSelectionCaptureOptions,
  ): CapturedNovelSelection
  modelText(snapshot: AssetSnapshot, selector?: NovelSelector): string
  prepareOperations(snapshot: AssetSnapshot, input: unknown): readonly NovelOperation[]
  decodeOperations(value: unknown): readonly NovelOperation[]
  materializeOperations(
    snapshot: AssetSnapshot,
    operations: readonly NovelOperation[],
  ): NovelAssetMaterialization
}

/** Effect-scoped Host registry of exact authored Asset type definitions. */
export class NovelAssetTypeRegistry extends Service {
  private readonly definitions = new Map<NovelAssetType, NovelAssetTypeDefinition>()

  constructor(ctx: Context) {
    super(ctx, 'novelAssetTypes')
  }

  /**
   * Register one exact type for the calling plugin lifetime.
   * @param definition - parser, selection, model, and mutation behavior for one type.
   * @returns an idempotent disposer that removes this exact contribution.
   */
  register(definition: NovelAssetTypeDefinition): () => void {
    validateDefinition(definition)
    if (this.definitions.has(definition.type)) {
      throw new Error(`novel asset type ${JSON.stringify(definition.type)} is already registered`)
    }
    const definitions = this.definitions
    definitions.set(definition.type, definition)
    const dispose = this.ctx.effect(() => () => {
      if (definitions.get(definition.type) === definition) definitions.delete(definition.type)
    }, `novelAssetTypes.register(${JSON.stringify(definition.type)})`)
    return () => { void dispose() }
  }

  /**
   * Resolve one required type definition.
   * @param type - exact authored `novel.type` declaration.
   * @returns the registered definition.
   * @throws {NovelRepositoryError} when the Project declares an unavailable type.
   */
  get(type: string): NovelAssetTypeDefinition {
    const definition = this.definitions.get(type as NovelAssetType)
    if (definition === undefined) {
      throw new NovelRepositoryError(
        `novel repository: asset type ${JSON.stringify(type)} has no registered Host definition`,
        'NOVEL_ASSET_INVALID',
      )
    }
    return definition
  }

  /**
   * List definitions in deterministic type order for project scanning.
   * @returns a stable copy of current registrations.
   */
  list(): readonly NovelAssetTypeDefinition[] {
    return [...this.definitions.values()].sort((left, right) => left.type.localeCompare(right.type))
  }
}

function validateDefinition(definition: NovelAssetTypeDefinition): void {
  if (definition.type.length === 0 || definition.type.trim() !== definition.type) {
    throw new Error('novel asset type must be a non-empty string without surrounding whitespace')
  }
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(definition.type)) {
    throw new Error(`novel asset type ${JSON.stringify(definition.type)} must be a dotted lowercase identifier`)
  }
  if (!/^[a-z][a-z0-9-]*$/u.test(definition.contentRoot)) {
    throw new Error(`novel asset type ${JSON.stringify(definition.type)} has invalid content root ${JSON.stringify(definition.contentRoot)}`)
  }
  if (definition.requiredContentRoot !== undefined && typeof definition.requiredContentRoot !== 'boolean') {
    throw new Error(`novel asset type ${JSON.stringify(definition.type)} has an invalid requiredContentRoot flag`)
  }
  if (definition.extensions.length === 0) {
    throw new Error(`novel asset type ${JSON.stringify(definition.type)} must accept at least one extension`)
  }
  if (definition.model.description.trim().length === 0
    || definition.model.proposalInstructions.trim().length === 0) {
    throw new Error(`novel asset type ${JSON.stringify(definition.type)} must provide model-facing instructions`)
  }
  if ((definition.create === undefined) !== (definition.model.creationInstructions === undefined)) {
    throw new Error(`novel asset type ${JSON.stringify(definition.type)} must contribute create() and creationInstructions together`)
  }
  if (definition.model.creationInstructions !== undefined
    && definition.model.creationInstructions.trim().length === 0) {
    throw new Error(`novel asset type ${JSON.stringify(definition.type)} has empty creationInstructions`)
  }
  if (definition.parent !== undefined) {
    if (definition.parent.allowedTypes.length === 0) {
      throw new Error(`novel asset type ${JSON.stringify(definition.type)} must allow at least one parent type`)
    }
    if (definition.parent.maxDepth !== undefined
      && (!Number.isSafeInteger(definition.parent.maxDepth) || definition.parent.maxDepth < 1)) {
      throw new Error(`novel asset type ${JSON.stringify(definition.type)} has an invalid parent maxDepth`)
    }
  }
  const seen = new Set<string>()
  for (const extension of definition.extensions) {
    if (!/^\.[a-z0-9]+$/u.test(extension) || extension !== extension.toLocaleLowerCase()) {
      throw new Error(`novel asset type ${JSON.stringify(definition.type)} has invalid extension ${JSON.stringify(extension)}`)
    }
    if (seen.has(extension)) {
      throw new Error(`novel asset type ${JSON.stringify(definition.type)} repeats extension ${JSON.stringify(extension)}`)
    }
    seen.add(extension)
  }
  for (const method of [
    'parse',
    'serializeContent',
    'captureSelection',
    'modelText',
    'prepareOperations',
    'decodeOperations',
    'materializeOperations',
  ] as const) {
    if (typeof definition[method] !== 'function') {
      throw new Error(`novel asset type ${JSON.stringify(definition.type)} is missing ${method}()`)
    }
  }
}

export default NovelAssetTypeRegistry
