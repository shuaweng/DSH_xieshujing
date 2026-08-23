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
}

/** Durable source metadata attached to the model-visible frozen message. */
export interface NovelContextSource {
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

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'novel-context': NovelContextSource
  }
}

/** Exact resolved source used by Novel tools and prompt preparation. */
export interface ResolvedNovelReference {
  readonly input: Required<Pick<NovelReferenceInput, 'projectId' | 'assetId' | 'revisionId' | 'label'>>
    & Pick<NovelReferenceInput, 'selector'>
  readonly snapshot: AssetSnapshot
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
