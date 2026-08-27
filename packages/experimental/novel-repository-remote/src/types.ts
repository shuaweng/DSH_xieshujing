/** Browser-safe Novel Repository Remote values. */

import type {
  AssetId,
  ChangeSetId,
  ProjectId,
  PreferenceCandidateId,
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

/** Browser request to activate the addressed Session working directory. */
export interface InitializeNovelProjectRequest {
  /** Author-visible book title; the Host owns generated identity and layout. */
  readonly title: string
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

/** Active-Asset identity whose current Revision is resolved when a prompt is compiled. */
export interface NovelContextFollowItemDescriptor {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly label: string
  readonly mode: 'follow'
  readonly origin: 'active-asset'
}

/** One exact Revision retained until the author removes it. */
export interface NovelContextPinnedItemDescriptor {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly label: string
  readonly selector?: NovelWireValue
  readonly mode: 'pinned'
  readonly origin: 'selection' | 'search'
}

/** Whole current workset submitted through one guarded Remote mutation. */
export interface NovelContextWorksetDescriptor {
  readonly version: 2
  readonly projectId: ProjectId
  readonly items: readonly (NovelContextFollowItemDescriptor | NovelContextPinnedItemDescriptor)[]
}

/** Browser request to create one new typed Asset at a provider-owned path. */
export interface CreateNovelAssetRequest {
  readonly type: string
  readonly title: string
  readonly parentId?: AssetId
  readonly content: NovelWireValue
}

/** Browser request to persist the complete order of one current Asset type. */
export interface ReorderNovelAssetsRequest {
  readonly type: string
  readonly orderedAssetIds: readonly AssetId[]
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

/** Browser-safe explicit finalization lineage for one exact chapter Revision. */
export interface NovelRevisionFinalizationDescriptor {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly finalizedAt: string
  readonly finalizedBySessionId: string
  readonly sourceRevisionId?: RevisionId
  readonly sourceChangeSetId?: ChangeSetId
  readonly sourceSessionId?: string
}

export interface NovelPreferenceEvidenceDescriptor {
  readonly before: string
  readonly after: string
  readonly inference: string
}

/** Browser-safe, inert preference candidate awaiting an explicit user decision. */
export interface NovelPreferenceCandidateDescriptor {
  readonly id: PreferenceCandidateId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly sourceRevisionId: RevisionId
  readonly finalRevisionId: RevisionId
  readonly targetStyleAssetId: AssetId
  readonly targetStyleRevisionId: RevisionId
  readonly generatedAt: string
  readonly summary: string
  readonly guidanceMarkdown: string
  readonly evidence: readonly NovelPreferenceEvidenceDescriptor[]
  readonly status: 'pending' | 'accepted' | 'rejected'
  readonly resultRevisionId?: RevisionId
}

export interface FinalizeNovelChapterDescriptor {
  readonly finalization: NovelRevisionFinalizationDescriptor
  readonly candidate?: NovelPreferenceCandidateDescriptor
  readonly noCandidateReason?: 'no-agent-source' | 'no-author-diff' | 'missing-style-profile'
}

export interface DecideNovelPreferenceDescriptor {
  readonly candidate: NovelPreferenceCandidateDescriptor
  readonly changeSet?: NovelChangeSetDescriptor
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
