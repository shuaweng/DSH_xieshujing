/** Public records for frozen Novel references and durable context. */

import type { UserMessage } from '@deepseek-ai/dsh-llm/message'
import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type {
  AssetId,
  AssetSnapshot,
  NovelProjectSnapshot,
  ProjectId,
  RevisionId,
  NovelSelector,
} from '@deepseek-ai/dsh-experimental-novel-repository/types'

/** One exact immutable Novel Asset, optionally narrowed to a text selection. */
export interface NovelReferenceInput {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector?: NovelSelector
  readonly label?: string
  /** Why the reference joined this prepared turn. */
  readonly origin?: NovelContextReferenceOrigin
  /** Whether the reference is explicit in this message or retained in the workset. */
  readonly mode?: NovelContextReferenceMode
}

/** Stable source labels retained in a Context Manifest. */
export type NovelContextReferenceOrigin = 'message' | 'selection' | 'active-asset' | 'search'
/** Explicit one-turn input or cross-turn workset retention mode. */
export type NovelContextReferenceMode = 'explicit' | 'follow' | 'pinned'

/** Task policies understood by the first Novel Context Compiler. */
export type NovelContextPolicyId =
  | 'direct-turn'
  | 'chapter-write'
  | 'selection-rewrite'
  | 'selection-review'
  | 'outline-edit'
  | 'chapter-review'
  | 'preference-learning'
  | 'story-state-learning'

/** How much authored material one compiled reference contributes. */
export type NovelContextProjection = 'coordinate' | 'selection' | 'full'

/** Why a compiled reference was selected for one model request. */
export type NovelContextReason =
  | 'explicit-material'
  | 'active-asset'
  | 'pinned-asset'
  | 'target-asset'
  | 'chapter-outline'
  | 'book-outline'
  | 'book-brief'
  | 'book-style'
  | 'story-state'
  | 'outline-parent'
  | 'outline-child'
  | 'draft-source'
  | 'final-source'

/** One exact task target supplied to the Novel Context Compiler. */
export interface NovelContextCompileTarget extends NovelReferenceInput {
  readonly projection: NovelContextProjection
  readonly reason: NovelContextReason
  /** Required material fails on budget overflow instead of degrading to a coordinate. */
  readonly required?: boolean
}

/** Explicit task request compiled without inferring intent from prose. */
export interface NovelContextCompileRequest {
  readonly policies: readonly NovelContextPolicyId[]
  readonly targets: readonly NovelContextCompileTarget[]
  /** Include the Session's current follow and pinned workset. */
  readonly includeWorkset?: boolean
}

/** One exact cross-turn reference retained in Session coordination state. */
export interface NovelContextWorksetItemV1 extends Required<Pick<
  NovelReferenceInput,
  'projectId' | 'assetId' | 'revisionId' | 'label'
>>,
  Pick<NovelReferenceInput, 'selector'> {
  readonly mode: Extract<NovelContextReferenceMode, 'follow' | 'pinned'>
  readonly origin: Extract<NovelContextReferenceOrigin, 'active-asset' | 'selection' | 'search'>
}

/** Legacy exact-Revision workset retained for existing Session replay. */
export interface NovelContextWorksetV1 {
  readonly version: 1
  readonly projectId: ProjectId
  readonly items: readonly NovelContextWorksetItemV1[]
}

/** Bounded cross-Workspace library summary visible on the Novel home surface. */
export interface NovelLibraryHomeSurface {
  readonly kind: 'library-home'
  readonly label: string
  readonly bookCount: number
  readonly manuscriptCharacters: number
  readonly todayCharacterDelta: number
  readonly books: readonly {
    readonly title: string
    readonly description?: string
    readonly chapterCount: number
    readonly manuscriptCharacters: number
    readonly continueTitle?: string
  }[]
  /** Registered books omitted from the bounded summary. */
  readonly omittedBooks: number
}

/** Non-Asset workbench surface context retained beside one project-bound workset. */
export type NovelContextSurface = NovelLibraryHomeSurface

/** Live active-Asset pointer resolved to the current Revision at prompt time. */
export interface NovelContextFollowItem {
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly label: string
  readonly mode: 'follow'
  readonly origin: 'active-asset'
}

/** Exact pinned Revision retained until the author removes it. */
export interface NovelContextPinnedItem extends Required<Pick<
  NovelReferenceInput,
  'projectId' | 'assetId' | 'revisionId' | 'label'
>>, Pick<NovelReferenceInput, 'selector'> {
  readonly mode: 'pinned'
  readonly origin: Extract<NovelContextReferenceOrigin, 'selection' | 'search'>
}

/** Current live/frozen workset authored by the browser. */
export interface NovelContextWorksetV2 {
  readonly version: 2
  readonly projectId: ProjectId
  readonly items: readonly (NovelContextFollowItem | NovelContextPinnedItem)[]
  /** Optional visible non-Asset surface; it never grants cross-project reads. */
  readonly surface?: NovelContextSurface
}

/** Every durable workset accepted during Session replay. */
export type NovelContextWorkset = NovelContextWorksetV1 | NovelContextWorksetV2

/** Versioned whole-value Session event; last event wins. */
export type NovelContextWorksetChange =
  | { readonly version: 1; readonly workset: NovelContextWorksetV1 }
  | { readonly version: 2; readonly workset: NovelContextWorksetV2 }

/** Legacy durable source retained for existing Session replay. */
export interface NovelContextSourceV1 {
  readonly kind: 'novel-context'
  readonly form: 'catalog'
  readonly version: 1
  readonly projectId: ProjectId
  readonly references: readonly {
    readonly assetId: AssetId
    readonly revisionId: RevisionId
    readonly label: string
    readonly selector?: NovelSelector
  }[]
}

/** Version-two frozen Context Manifest attached to model-visible material. */
export interface NovelContextSourceV2 {
  readonly kind: 'novel-context'
  readonly form: 'manifest'
  readonly version: 2
  readonly manifestId: `sha256:${string}`
  readonly projectId: ProjectId
  readonly references: readonly {
    readonly assetId: AssetId
    readonly revisionId: RevisionId
    readonly label: string
    readonly selector?: NovelSelector
    readonly origin: NovelContextReferenceOrigin
    readonly mode: NovelContextReferenceMode
  }[]
}

/** One exact item selected and budgeted by the Context Compiler. */
export interface NovelContextManifestItem {
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly label: string
  readonly type: string
  readonly selector?: NovelSelector
  readonly origin: NovelContextReferenceOrigin
  readonly mode: NovelContextReferenceMode
  readonly projection: NovelContextProjection
  readonly reason: NovelContextReason
  readonly contentHash: string
  readonly modelTextBytes: number
  readonly modelTextHash?: `sha256:${string}`
}

/** Version-three task-aware Context Manifest attached to compiled material. */
export interface NovelContextSourceV3 {
  readonly kind: 'novel-context'
  readonly form: 'manifest'
  readonly version: 3
  readonly manifestId: `sha256:${string}`
  readonly projectId: ProjectId
  readonly policies: readonly NovelContextPolicyId[]
  readonly references: readonly NovelContextManifestItem[]
  /** Exact bounded UI surface facts frozen for this model request. */
  readonly surface?: NovelContextSurface
}

/** Every durable Novel context source accepted during Session replay. */
export type NovelContextSource = NovelContextSourceV1 | NovelContextSourceV2 | NovelContextSourceV3

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'novel-context': NovelContextSource
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Whole-value non-prose reference workset; latest event wins. */
    'novel/context-workset': NovelContextWorksetChange
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    novelContextWorkset: NovelContextWorkset | null
  }
  interface SessionProjectionMap {
    /** Current live-follow and exact-pinned Novel workset, or null before the first mutation. */
    novelContextWorkset: NovelContextWorkset | null
  }
}

/** Exact resolved source used by Novel tools and prompt preparation. */
export interface ResolvedNovelReference {
  readonly input: Required<Pick<NovelReferenceInput,
    'projectId' | 'assetId' | 'revisionId' | 'label' | 'origin' | 'mode'>>
    & Pick<NovelReferenceInput, 'selector'>
  readonly snapshot: AssetSnapshot
  /** Exact model projection; workset preparation may intentionally omit it from the Manifest. */
  readonly text: string
}

/** One-project exact-read result. */
export interface ResolvedNovelReferences {
  readonly project: NovelProjectSnapshot
  readonly references: readonly ResolvedNovelReference[]
}

/** Direct readable content plus one optional durable frozen context message. */
export interface PreparedNovelMessage {
  readonly content: ContentBlock[]
  readonly additionalContext?: UserMessage
}

/** Frozen, budgeted result shared by root turns and fixed Novel workflows. */
export interface CompiledNovelContext {
  readonly source: NovelContextSourceV3
  /** Exact model-visible frame; callers must log this text in the receiving Session. */
  readonly text: string
  readonly additionalContext: UserMessage
}
