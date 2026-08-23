/** Provider-neutral structured values owned by the `planning.outline` Asset package. */

import type { ContentHash } from '@deepseek-ai/dsh-experimental-novel-repository/types'

/** One stable node in an ordered outline tree. */
export interface OutlineNode {
  readonly id: string
  readonly title: string
  readonly summary?: string
  readonly goal?: string
  readonly conflict?: string
  readonly turn?: string
  readonly children: readonly OutlineNode[]
}

/** Complete typed content of one YAML outline Asset. */
export interface PlanningOutlineContent {
  readonly kind: 'outline'
  readonly nodes: readonly OutlineNode[]
}

/** Browser input selecting one stable node from one retained outline Revision. */
export interface OutlineNodeSelectionInput {
  readonly kind: 'outline-node'
  readonly nodeId: string
}

/** Frozen exact-node selector used by context and durable operations. */
export interface OutlineNodeSelector extends OutlineNodeSelectionInput {
  readonly nodeHash: ContentHash
}

/** Fields the first outline operation can change without changing tree identity or order. */
export interface OutlineNodeChanges {
  readonly title?: string
  readonly summary?: string | null
  readonly goal?: string | null
  readonly conflict?: string | null
  readonly turn?: string | null
}

/** Revision-bound field update for one outline node. */
export interface UpdateOutlineNodeOperation {
  readonly kind: 'update-outline-node'
  readonly selector: OutlineNodeSelector
  readonly changes: OutlineNodeChanges
}

declare module '@deepseek-ai/dsh-experimental-novel-repository/types' {
  interface NovelAssetTypeMap {
    'planning.outline': {
      readonly content: PlanningOutlineContent
      readonly selectionInput: OutlineNodeSelectionInput
      readonly selector: OutlineNodeSelector
      readonly operation: UpdateOutlineNodeOperation
    }
  }
}
