/** Browser-safe Novel Repository Remote values. */

import type {
  AssetId,
  ChangeSetId,
  ProjectId,
  RevisionId,
  SelectionRefId,
} from '@deepseek-ai/dsh-experimental-novel-repository/brand'
import type { NovelAssetType } from '@deepseek-ai/dsh-experimental-novel-repository/types'

/** Read-only project discovery result with no filesystem capability identity. */
export interface NovelProjectDescriptor {
  /** Project format version. */
  readonly schema: 1
  /** Stable manifest-owned project identity. */
  readonly id: ProjectId
  /** Author-visible project title. */
  readonly title: string
  /** Host display path of the canonical project root. */
  readonly rootDisplayPath: string
  /** Host display path of the canonical `novel.yaml`. */
  readonly manifestDisplayPath: string
  /** Host display paths of canonical content roots, keyed by manifest name. */
  readonly contentRootDisplayPaths: Readonly<Record<string, string>>
}

/** One current browser navigation row. */
export interface NovelAssetDescriptor {
  readonly id: AssetId
  readonly projectId: ProjectId
  readonly type: NovelAssetType
  readonly projectRelativePath: string
  readonly revisionId: RevisionId
  /** Canonical `sha256:` content hash validated by the Host repository. */
  readonly contentHash: string
  readonly title: string
}

/** Browser-safe chapter body bound to one exact Revision. */
export interface NovelChapterDocument extends NovelAssetDescriptor {
  readonly body: string
}

/** Guarded browser save of the chapter body only. */
export interface SaveNovelChapterRequest {
  readonly assetId: AssetId
  readonly baseRevisionId: RevisionId
  readonly body: string
}

/** Exact browser range to freeze after any required save completes. */
export interface CaptureNovelSelectionRequest {
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly startUtf16: number
  readonly endUtf16: number
}

/** Frozen SelectionRef returned directly to the browser. */
export interface NovelSelectionDescriptor {
  readonly version: 1
  readonly id: SelectionRefId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector: {
    readonly kind: 'text-range'
    readonly startUtf16: number
    readonly endUtf16: number
    /** Canonical `sha256:` quote hash validated by the Host repository. */
    readonly quoteHash: string
    readonly prefix?: string
    readonly suffix?: string
  }
  readonly preview?: string
  /** Canonical mention inserted into the Agent composer after the commit barrier. */
  readonly mention: string
}

/** Browser-safe review projection of one durable ChangeSet. */
export interface NovelChangeSetDescriptor {
  readonly id: ChangeSetId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly baseRevisionId: RevisionId
  readonly summary: string
  readonly status: 'proposed' | 'applying' | 'applied' | 'rejected' | 'conflicted'
  readonly resultRevisionId?: RevisionId
  readonly operation: {
    readonly kind: 'replace-text'
    readonly startUtf16: number
    readonly endUtf16: number
    readonly quoteHash: string
    readonly replacement: string
  }
}
