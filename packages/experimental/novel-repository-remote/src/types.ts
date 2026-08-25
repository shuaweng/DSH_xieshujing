/** Browser-safe Novel Repository Remote values. */

import type {
  AssetId,
  ChangeSetId,
  ProjectId,
  RevisionId,
  SelectionRefId,
} from '@deepseek-ai/dsh-experimental-novel-repository/brand'
/** Closed JSON wire value; exact Asset schemas remain owned by the two registries. */
export type NovelWireValue = null | boolean | number | string | NovelWireValue[] | { [key: string]: NovelWireValue }

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
  readonly type: string
  readonly parentId?: AssetId
  readonly projectRelativePath: string
  readonly revisionId: RevisionId
  /** Canonical `sha256:` content hash validated by the Host repository. */
  readonly contentHash: string
  readonly title: string
}

/** Browser and Agent-facing bounded Asset discovery query. */
export interface SearchNovelAssetsRequest {
  readonly query: string
  readonly types?: readonly string[]
  readonly limit?: number
}

/** Exact current Revision discovered by the Host repository. */
export interface NovelAssetSearchResult extends NovelAssetDescriptor {
  readonly excerpt: string
  readonly score: number
}

/** One exact non-prose reference retained across turns. */
export interface NovelContextWorksetItemDescriptor {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly label: string
  readonly selector?: NovelWireValue
  readonly mode: 'follow' | 'pinned'
  readonly origin: 'active-asset' | 'selection' | 'search'
}

/** Whole current workset submitted through one guarded Remote mutation. */
export interface NovelContextWorksetDescriptor {
  readonly version: 1
  readonly projectId: ProjectId
  readonly items: readonly NovelContextWorksetItemDescriptor[]
}

/** Browser request to create one new typed Asset at a provider-owned path. */
export interface CreateNovelAssetRequest {
  readonly type: string
  readonly title: string
  readonly parentId?: AssetId
  readonly content: NovelWireValue
}

/** Browser-safe typed Asset content bound to one exact Revision. */
export interface NovelAssetDocument extends NovelAssetDescriptor {
  readonly content: NovelWireValue
}

/** Metadata-only browser projection of one immutable retained Revision. */
export interface NovelAssetRevisionDescriptor {
  readonly id: RevisionId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly parentRevisionId?: RevisionId
  readonly contentHash: string
  readonly origin: 'initial-scan' | 'user-edit' | 'agent-apply' | 'external-edit'
  readonly createdAt: string
}

/** One generated analysis result bound to the exact Revision on screen. */
export interface NovelAnalysisReportDescriptor {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly kind: 'chapter-review' | 'noai-scan'
  readonly analyzerVersion: string
  readonly generatedAt: string
  readonly data: NovelWireValue
  readonly sourceSessionId?: string
  readonly workerSessionId?: string
}

/** Guarded browser save of one complete typed Asset content value. */
export interface SaveNovelAssetRequest {
  readonly assetId: AssetId
  readonly baseRevisionId: RevisionId
  readonly title?: string
  readonly content: NovelWireValue
}

/** Exact browser range to freeze after any required save completes. */
export interface CaptureNovelSelectionRequest {
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector: NovelWireValue
}

/** Frozen SelectionRef returned directly to the browser. */
export interface NovelSelectionDescriptor {
  readonly version: 1
  readonly id: SelectionRefId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector: NovelWireValue
  readonly preview?: string
  /** Canonical mention inserted into the Agent composer after the commit barrier. */
  readonly mention: string
}

/** Browser-safe review projection of one durable ChangeSet. */
export interface NovelChangeSetDescriptor {
  readonly id: ChangeSetId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly assetType: string
  readonly baseRevisionId: RevisionId
  readonly summary: string
  readonly status: 'proposed' | 'applying' | 'applied' | 'rejected' | 'conflicted'
  readonly resultRevisionId?: RevisionId
  readonly operations: readonly NovelWireValue[]
}
