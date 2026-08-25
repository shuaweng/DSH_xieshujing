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

/** One exact cross-turn reference retained in Session coordination state. */
export interface NovelContextWorksetItem extends Required<Pick<
  NovelReferenceInput,
  'projectId' | 'assetId' | 'revisionId' | 'label'
>>,
  Pick<NovelReferenceInput, 'selector'> {
  readonly mode: Extract<NovelContextReferenceMode, 'follow' | 'pinned'>
  readonly origin: Extract<NovelContextReferenceOrigin, 'active-asset' | 'selection' | 'search'>
}

/** Whole current non-prose reference workset for one Novel Session. */
export interface NovelContextWorkset {
  readonly version: 1
  readonly projectId: ProjectId
  readonly items: readonly NovelContextWorksetItem[]
}

/** Versioned whole-value Session event; last event wins. */
export interface NovelContextWorksetChange {
  readonly version: 1
  readonly workset: NovelContextWorkset
}

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

/** Every durable Novel context source accepted during Session replay. */
export type NovelContextSource = NovelContextSourceV1 | NovelContextSourceV2

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
    /** Current exact Novel workset, or null before the first mutation. */
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
