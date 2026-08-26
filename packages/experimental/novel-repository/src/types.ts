/** Public Novel Project repository values. */

import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  AssetId,
  ChangeSetId,
  ProjectId,
  PreferenceCandidateId,
  RevisionId,
  SelectionRefId,
} from './brand.ts'

export type {
  AssetId,
  ChangeSetId,
  ProjectId,
  PreferenceCandidateId,
  RevisionId,
  SelectionRefId,
} from './brand.ts'

/** SHA-256 over the named exact UTF-8 bytes. */
export type ContentHash = `sha256:${string}`

/** Parsed authored content of one Markdown chapter. */
export interface ManuscriptChapterContent {
  readonly kind: 'manuscript'
  readonly body: string
}

/** Version-one semantic range over the exact Markdown body of one Revision. */
export interface TextRangeSelector {
  readonly kind: 'text-range'
  readonly startUtf16: number
  readonly endUtf16: number
  readonly quoteHash: ContentHash
  readonly prefix?: string
  readonly suffix?: string
}

/** Unfrozen browser range submitted for validation against one Revision. */
export interface TextRangeSelectionInput {
  readonly kind: 'text-range'
  readonly startUtf16: number
  readonly endUtf16: number
}

/** First typed manuscript mutation accepted from a model proposal. */
export interface ReplaceTextOperation {
  readonly kind: 'replace-text'
  readonly selector: TextRangeSelector
  readonly replacement: string
}

/** Exact insertion into one retained manuscript Revision. */
export interface InsertTextOperation {
  readonly kind: 'insert-text'
  readonly atUtf16: number
  readonly text: string
}

/**
 * Merge-extensible authored Asset values keyed by their exact `novel.type` declaration.
 * Type packages augment this map and register matching runtime definitions.
 */
export interface NovelAssetTypeMap {
  'manuscript.chapter': {
    readonly content: ManuscriptChapterContent
    readonly selectionInput: TextRangeSelectionInput
    readonly selector: TextRangeSelector
    readonly operation: ReplaceTextOperation | InsertTextOperation
  }
}

/** Asset kinds contributed to the Novel workbench. */
export type NovelAssetType = Extract<keyof NovelAssetTypeMap, string>
/** Parsed authored content contributed by every Asset type. */
export type NovelAssetContent = NovelAssetTypeMap[NovelAssetType]['content']
/** Browser selection inputs contributed by every selectable Asset type. */
export type NovelSelectionInput = NovelAssetTypeMap[NovelAssetType]['selectionInput']
/** Frozen selectors contributed by every selectable Asset type. */
export type NovelSelector = NovelAssetTypeMap[NovelAssetType]['selector']
/** Frozen selector corresponding to one exact selection-input shape. */
export type NovelSelectorFor<Input extends NovelSelectionInput> = Extract<
  NovelSelector,
  { readonly kind: Input['kind'] }
>
/** Durable operations contributed by every mutable Asset type. */
export type NovelOperation = NovelAssetTypeMap[NovelAssetType]['operation']

/** Origin of one immutable Revision. */
export type RevisionOrigin = 'initial-scan' | 'user-edit' | 'agent-apply' | 'external-edit'

/** Stable error codes raised while locating or validating a Novel Project. */
export type NovelRepositoryErrorCode =
  | 'NOVEL_PROJECT_ROOT_INVALID'
  | 'NOVEL_PROJECT_INITIALIZATION_INVALID'
  | 'NOVEL_PROJECT_ALREADY_INITIALIZED'
  | 'NOVEL_PROJECT_CONTENT_ROOT_CONFLICT'
  | 'NOVEL_PROJECT_MANIFEST_INVALID'
  | 'NOVEL_PROJECT_MANIFEST_TOO_LARGE'
  | 'NOVEL_PROJECT_DESCRIPTOR_TOO_LARGE'
  | 'NOVEL_RESPONSE_TOO_LARGE'
  | 'NOVEL_PROJECT_SCHEMA_UNSUPPORTED'
  | 'NOVEL_PROJECT_PATH_ESCAPE'
  | 'NOVEL_PROJECT_ID_CONFLICT'
  | 'NOVEL_ASSET_INVALID'
  | 'NOVEL_ASSET_TOO_LARGE'
  | 'NOVEL_ASSET_DUPLICATE_ID'
  | 'NOVEL_ASSET_NOT_FOUND'
  | 'NOVEL_ASSET_CHANGED_DURING_SCAN'
  | 'NOVEL_HISTORY_SCHEMA_UNSUPPORTED'
  | 'NOVEL_HISTORY_CORRUPT'
  | 'NOVEL_REVISION_NOT_FOUND'
  | 'NOVEL_REVISION_STALE'
  | 'NOVEL_SELECTION_INVALID'
  | 'NOVEL_SEARCH_INVALID'
  | 'NOVEL_CHANGESET_NOT_FOUND'
  | 'NOVEL_CHANGESET_INVALID'
  | 'NOVEL_CHANGESET_CONFLICT'
  | 'NOVEL_CHANGESET_UNAUTHORIZED'
  | 'NOVEL_FINALIZATION_INVALID'
  | 'NOVEL_PREFERENCE_CANDIDATE_NOT_FOUND'
  | 'NOVEL_PREFERENCE_CANDIDATE_INVALID'

/** One validated version-one Novel Project declaration. */
export interface NovelProjectSnapshot {
  /** Project format version. */
  readonly schema: 1
  /** Stable manifest-owned project identity. */
  readonly id: ProjectId
  /** Author-visible project title. */
  readonly title: string
  /** Canonical project root in the active filesystem provider. */
  readonly root: FsTarget
  /** Canonical `novel.yaml` target. */
  readonly manifest: FsTarget
  /** Canonical content roots keyed by their manifest names. */
  readonly contentRoots: Readonly<Record<string, FsTarget>>
}

/** Minimal authored input for activating one existing directory as a Novel Project. */
export interface InitializeNovelProjectRequest {
  /** Author-visible book title; the provider owns ids, paths, and manifest layout. */
  readonly title: string
}

/** One current authored asset discovered from the project files. */
export interface Asset {
  readonly id: AssetId
  readonly projectId: ProjectId
  readonly type: NovelAssetType
  /** Stable semantic parent; paths never define Asset hierarchy. */
  readonly parentId?: AssetId
  readonly projectRelativePath: string
}

/** Immutable exact-file snapshot bound to one retained Revision. */
export interface AssetSnapshot {
  readonly asset: Asset
  readonly revisionId: RevisionId
  readonly serializedUtf8: Uint8Array
  readonly contentHash: ContentHash
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly content: NovelAssetContent
}

/** Current catalog row used by list and browser navigation Consumers. */
export interface AssetSummary {
  readonly asset: Asset
  readonly revisionId: RevisionId
  readonly contentHash: ContentHash
  readonly title: string
}

/** Bounded semantic catalog query shared by browser and Agent Consumers. */
export interface SearchAssetsRequest {
  /** Non-empty human query, matched lexically in version one. */
  readonly query: string
  /** Optional exact Asset-type allowlist. */
  readonly types?: readonly NovelAssetType[]
  /** Positive bounded result count requested by the Consumer. */
  readonly limit?: number
}

/** One exact current Revision discovered by the repository search seam. */
export interface AssetSearchResult {
  readonly summary: AssetSummary
  /** Short author-text excerpt around the strongest lexical match. */
  readonly excerpt: string
  /** Provider-defined deterministic relevance score; larger ranks first. */
  readonly score: number
}

/** One immutable Revision retained in `.novel/history.sqlite`. */
export interface AssetRevision {
  readonly id: RevisionId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly parentRevisionId?: RevisionId
  readonly serializedUtf8: Uint8Array
  readonly contentHash: ContentHash
  readonly origin: RevisionOrigin
  readonly createdAt: string
}

/** Metadata-only view of one immutable retained Revision. */
export interface AssetRevisionSummary {
  readonly id: RevisionId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly parentRevisionId?: RevisionId
  readonly contentHash: ContentHash
  readonly origin: RevisionOrigin
  readonly createdAt: string
}

/** Explicit author decision that one exact chapter Revision is a finished version. */
export interface RevisionFinalization {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly finalizedAt: string
  readonly finalizedBySessionId: SessionId
  /** Nearest Agent-authored ancestor eligible for draft/final comparison. */
  readonly sourceRevisionId?: RevisionId
  readonly sourceChangeSetId?: ChangeSetId
  readonly sourceSessionId?: SessionId
}

/** Bounded evidence supporting one inferred author preference. */
export interface NovelPreferenceEvidence {
  readonly before: string
  readonly after: string
  readonly inference: string
}

export type NovelPreferenceCandidateStatus = 'pending' | 'accepted' | 'rejected'

/** Model-inferred guidance that remains inert until the author decides it. */
export interface NovelPreferenceCandidate {
  readonly id: PreferenceCandidateId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly sourceRevisionId: RevisionId
  readonly finalRevisionId: RevisionId
  readonly sourceChangeSetId?: ChangeSetId
  readonly sourceSessionId?: SessionId
  readonly targetStyleAssetId: AssetId
  readonly targetStyleRevisionId: RevisionId
  readonly extractorVersion: string
  readonly generatedAt: string
  readonly summary: string
  readonly guidanceMarkdown: string
  readonly evidence: readonly NovelPreferenceEvidence[]
  readonly status: NovelPreferenceCandidateStatus
  readonly decidedAt?: string
  readonly decidedBySessionId?: SessionId
  readonly resultChangeSetId?: ChangeSetId
  readonly resultRevisionId?: RevisionId
}

/** Valid generated preference candidate before provider identity and project fields are assigned. */
export interface PutNovelPreferenceCandidateRequest {
  readonly assetId: AssetId
  readonly sourceRevisionId: RevisionId
  readonly finalRevisionId: RevisionId
  readonly sourceChangeSetId?: ChangeSetId
  readonly sourceSessionId?: SessionId
  readonly targetStyleAssetId: AssetId
  readonly targetStyleRevisionId: RevisionId
  readonly extractorVersion: string
  readonly generatedAt: string
  readonly summary: string
  readonly guidanceMarkdown: string
  readonly evidence: readonly NovelPreferenceEvidence[]
}

/** First durable analysis products attached to exact chapter bytes. */
export type NovelAnalysisReportKind = 'chapter-review' | 'noai-scan'

/** One generated analysis result bound to an immutable retained Revision. */
export interface NovelAnalysisReport {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly kind: NovelAnalysisReportKind
  readonly analyzerVersion: string
  readonly generatedAt: string
  readonly data: JsonValue
  readonly sourceSessionId?: SessionId
  readonly workerSessionId?: SessionId
}

/** Successful generated analysis to upsert for one exact Revision and kind. */
export interface PutNovelAnalysisReportRequest {
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly kind: NovelAnalysisReportKind
  readonly analyzerVersion: string
  readonly generatedAt: string
  readonly data: JsonValue
  readonly sourceSessionId?: SessionId
  readonly workerSessionId?: SessionId
}

/** Frozen semantic selection suitable for durable prompt references. */
export interface SelectionRef<Input extends NovelSelectionInput = NovelSelectionInput> {
  readonly version: 1
  readonly id: SelectionRefId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector: NovelSelectorFor<Input>
  readonly preview?: string
}

/** Request to publish validated authored content while retaining Asset identity. */
export interface SaveAssetContentRequest {
  readonly assetId: AssetId
  readonly baseRevisionId: RevisionId
  /** Optional authored display title, persisted through the Asset type serializer. */
  readonly title?: string
  readonly content: NovelAssetContent
}

/** Request to create one new typed Asset below its registered content root. */
export interface CreateAssetRequest {
  readonly type: NovelAssetType
  readonly title: string
  readonly parentId?: AssetId
  readonly content: NovelAssetContent
  readonly actor:
    | { readonly kind: 'agent'; readonly sessionId: SessionId }
    | { readonly kind: 'user'; readonly sessionId?: SessionId }
}

/** Request to freeze a non-empty browser selection over one retained Revision. */
export interface CaptureSelectionRequest<Input extends NovelSelectionInput = NovelSelectionInput> {
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector: Input
}

/** Request to retain one proposal without changing authored files. */
export interface ProposeChangeSetRequest {
  readonly assetId: AssetId
  readonly baseRevisionId: RevisionId
  readonly operations: readonly NovelOperation[]
  readonly actor:
    | { readonly kind: 'agent'; readonly sessionId: SessionId }
    | { readonly kind: 'user'; readonly sessionId?: SessionId }
  readonly summary: string
}

/** Explicit user authority for one terminal ChangeSet decision. */
export interface ChangeSetAuthorization {
  readonly sessionId: SessionId
}

/** Durable, reviewable single-asset proposal. */
export interface ChangeSet {
  readonly id: ChangeSetId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly assetType: NovelAssetType
  readonly baseRevisionId: RevisionId
  readonly operations: readonly NovelOperation[]
  readonly actor:
    | { readonly kind: 'agent'; readonly sessionId: SessionId }
    | { readonly kind: 'user'; readonly sessionId?: SessionId }
  readonly summary: string
  readonly status: 'proposed' | 'applying' | 'applied' | 'rejected' | 'conflicted'
  readonly resultRevisionId?: RevisionId
}
