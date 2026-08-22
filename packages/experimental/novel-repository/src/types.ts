/** Public Novel Project repository values. */

import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  AssetId,
  ChangeSetId,
  ProjectId,
  RevisionId,
  SelectionRefId,
} from './brand.ts'

export type {
  AssetId,
  ChangeSetId,
  ProjectId,
  RevisionId,
  SelectionRefId,
} from './brand.ts'

/** SHA-256 over the named exact UTF-8 bytes. */
export type ContentHash = `sha256:${string}`

/** Asset kinds supported by the first Novel workbench format. */
export type NovelAssetType = 'manuscript.chapter'

/** Origin of one immutable Revision. */
export type RevisionOrigin = 'initial-scan' | 'user-edit' | 'agent-apply' | 'external-edit'

/** Stable error codes raised while locating or validating a Novel Project. */
export type NovelRepositoryErrorCode =
  | 'NOVEL_PROJECT_ROOT_INVALID'
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
  | 'NOVEL_CHANGESET_NOT_FOUND'
  | 'NOVEL_CHANGESET_INVALID'
  | 'NOVEL_CHANGESET_CONFLICT'
  | 'NOVEL_CHANGESET_UNAUTHORIZED'

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

/** One current authored asset discovered from the project files. */
export interface Asset {
  readonly id: AssetId
  readonly projectId: ProjectId
  readonly type: NovelAssetType
  readonly projectRelativePath: string
}

/** Immutable exact-file snapshot bound to one retained Revision. */
export interface AssetSnapshot {
  readonly asset: Asset
  readonly revisionId: RevisionId
  readonly serializedUtf8: Uint8Array
  readonly contentHash: ContentHash
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly body: string
}

/** Current catalog row used by list and browser navigation Consumers. */
export interface AssetSummary {
  readonly asset: Asset
  readonly revisionId: RevisionId
  readonly contentHash: ContentHash
  readonly title: string
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

/** Version-one semantic range over the exact Markdown body of one Revision. */
export interface TextRangeSelector {
  readonly kind: 'text-range'
  readonly startUtf16: number
  readonly endUtf16: number
  readonly quoteHash: ContentHash
  readonly prefix?: string
  readonly suffix?: string
}

/** Frozen semantic selection suitable for durable prompt references. */
export interface SelectionRef {
  readonly version: 1
  readonly id: SelectionRefId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector: TextRangeSelector
  readonly preview?: string
}

/** Request to replace only the authored body while retaining validated Frontmatter. */
export interface SaveChapterBodyRequest {
  readonly assetId: AssetId
  readonly baseRevisionId: RevisionId
  readonly body: string
}

/** Request to freeze a non-empty browser selection over one retained Revision. */
export interface CaptureSelectionRequest {
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly startUtf16: number
  readonly endUtf16: number
}

/** First typed manuscript mutation accepted from a model proposal. */
export interface ReplaceTextOperation {
  readonly kind: 'replace-text'
  readonly selector: TextRangeSelector
  readonly replacement: string
}

/** Typed operations supported by the first ChangeSet format. */
export type NovelOperation = ReplaceTextOperation

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
  readonly baseRevisionId: RevisionId
  readonly operations: readonly NovelOperation[]
  readonly actor:
    | { readonly kind: 'agent'; readonly sessionId: SessionId }
    | { readonly kind: 'user'; readonly sessionId?: SessionId }
  readonly summary: string
  readonly status: 'proposed' | 'applying' | 'applied' | 'rejected' | 'conflicted'
  readonly resultRevisionId?: RevisionId
}
